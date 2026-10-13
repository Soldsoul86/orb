import java.nio.file.*;
import java.security.*;
import java.util.*;
public class SignResponse {
  public static void main(String[] args)throws Exception{
    KeyStore store=KeyStore.getInstance(Path.of(args[0]).toFile(),"android".toCharArray());
    byte[] data=Files.readAllBytes(Path.of(args[1]));
    String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
    Signature s=Signature.getInstance(args[3]);s.initSign((PrivateKey)store.getKey("keep-local-next","android".toCharArray()));s.update(data);
    Path out=Path.of(args[2],hash+".sig");Files.createDirectories(out.getParent());Files.writeString(out,Base64.getEncoder().encodeToString(s.sign()));
    System.out.println("Public detached signature saved: "+out);
  }
}
