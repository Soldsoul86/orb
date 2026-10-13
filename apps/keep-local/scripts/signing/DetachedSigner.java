import com.android.apksig.ApkSigner;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.*;
import java.security.interfaces.*;
import java.security.spec.AlgorithmParameterSpec;
import java.math.BigInteger;
import java.util.*;

/** Offline signing bridge: CI sees only a public certificate and bound signatures. */
public class DetachedSigner {
  static Path responses;
  public static class PublicOnlyKey implements PrivateKey, RSAKey {
    final BigInteger modulus;
    PublicOnlyKey(RSAPublicKey key) {modulus=key.getModulus();}
    public BigInteger getModulus(){return modulus;}
    public String getAlgorithm(){return "RSA";}
    public String getFormat(){return null;}
    public byte[] getEncoded(){return null;}
  }
  public static class ProviderImpl extends Provider {
    public ProviderImpl(){super("KeepLocalOffline",1.0,"Offline signatures, no CI private key");put("Signature.SHA256withRSA", SHA256.class.getName());put("Signature.SHA512withRSA",SHA512.class.getName());}
  }
  public static class SHA256 extends Bridge {public SHA256(){super("SHA256withRSA");}}
  public static class SHA512 extends Bridge {public SHA512(){super("SHA512withRSA");}}
  public static class Bridge extends SignatureSpi {
    final String algorithm;ByteArrayOutputStream data;Signature delegate;
    Bridge(String a){algorithm=a;}
    protected void engineInitVerify(PublicKey key)throws InvalidKeyException{try{delegate=Signature.getInstance(algorithm,"SunRsaSign");delegate.initVerify(key);}catch(GeneralSecurityException e){throw new InvalidKeyException(e);}}
    protected void engineInitSign(PrivateKey key)throws InvalidKeyException{
      if(!(key instanceof PublicOnlyKey))throw new InvalidKeyException("Offline key required");delegate=null;data=new ByteArrayOutputStream();}
    protected void engineUpdate(byte b)throws SignatureException{if(delegate!=null)delegate.update(b);else data.write(b);}
    protected void engineUpdate(byte[] b,int off,int len)throws SignatureException{if(delegate!=null)delegate.update(b,off,len);else data.write(b,off,len);}
    protected byte[] engineSign()throws SignatureException{try{
      byte[] input=data.toByteArray();String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input));
      Path response=responses.resolve(hash+".sig");
      if(!Files.exists(response)){System.out.println("OFFLINE_SIGN_REQUEST "+algorithm+" "+hash+" "+Base64.getEncoder().encodeToString(input));throw new SignatureException("Offline signature required");}
      return Base64.getDecoder().decode(Files.readString(response).trim());
    }catch(IOException|NoSuchAlgorithmException e){throw new SignatureException(e);}}
    protected boolean engineVerify(byte[] signature)throws SignatureException{return delegate.verify(signature);}
    protected void engineSetParameter(String p,Object v){} protected Object engineGetParameter(String p){return null;}
  }
  public static void main(String[] args)throws Exception{
    responses=Path.of(args[3]);Security.insertProviderAt(new ProviderImpl(),1);
    X509Certificate cert=(X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(new FileInputStream(args[2]));
    ApkSigner.SignerConfig signer=new ApkSigner.SignerConfig.Builder("keep-local-next",new PublicOnlyKey((RSAPublicKey)cert.getPublicKey()),List.of(cert)).build();
    new ApkSigner.Builder(List.of(signer)).setInputApk(new File(args[0])).setOutputApk(new File(args[1])).setMinSdkVersion(29).setV1SigningEnabled(false).setV2SigningEnabled(false).setV3SigningEnabled(true).setV4SigningEnabled(false).build().sign();
  }
}
