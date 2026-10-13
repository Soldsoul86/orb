"""Pinned public weights; build a local-install model pack and real-photo evaluation corpus."""
from pathlib import Path
import urllib.request,hashlib,json,zipfile,time,os
from concurrent.futures import ThreadPoolExecutor
root=Path(__file__).resolve().parents[1]
revision='6ef1ebc8b0766a7a8d11b146462c99cdf74dd22d'
repo='Xenova/clip-vit-base-patch32'
model=root/'model-work';model.mkdir(exist_ok=True)
files={'vision.onnx':'onnx/vision_model_quantized.onnx','text.onnx':'onnx/text_model_quantized.onnx','vocab.json':'vocab.json','merges.txt':'merges.txt'}
def get(entry):
    name,remote=entry;p=model/name
    if not p.exists():urllib.request.urlretrieve(f'https://huggingface.co/{repo}/resolve/{revision}/{remote}',p)
    return name,{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
with ThreadPoolExecutor(4) as pool: info=dict(pool.map(get,files.items()))
manifest={'id':'clip-vit-b32-int8-v1','repository':repo,'revision':revision,'files':info}
assets=root/'app/src/main/assets';assets.mkdir(parents=True,exist_ok=True)
expected=assets/'visual-model.json'
if expected.exists():assert json.loads(expected.read_text())==manifest, 'Pinned model content changed'
else:expected.write_text(json.dumps(manifest,indent=2))
delivery=root/'model-delivery';delivery.mkdir(exist_ok=True)
with zipfile.ZipFile(delivery/'visual-model-pack.zip','w',zipfile.ZIP_STORED) as z:
    for name in files:z.write(model/name,name)
(delivery/'model-manifest.json').write_text(json.dumps(manifest,indent=2))
urllib.request.urlretrieve('https://raw.githubusercontent.com/openai/CLIP/main/LICENSE',delivery/'CLIP-LICENSE.txt')
print('MODEL_MANIFEST',json.dumps(manifest))
import onnxruntime as ort
for name in ['vision.onnx','text.onnx']:
    session=ort.InferenceSession(str(model/name),providers=['CPUExecutionProvider'])
    print(name,'INPUTS',[(x.name,x.shape,x.type)for x in session.get_inputs()],'OUTPUTS',[(x.name,x.shape)for x in session.get_outputs()])
from transformers import CLIPTokenizer
queries=['a photograph of a cat','a cup of coffee','an astronaut in a spacesuit','a rocket launch','Find the video where someone is eating noodles.','Show me screenshots about CAD drawings.']
tokenizer=CLIPTokenizer(vocab_file=str(model/'vocab.json'),merges_file=str(model/'merges.txt'))
testassets=root/'app/src/androidTest/assets';testassets.mkdir(parents=True,exist_ok=True)
(testassets/'tokenizer-golden.json').write_text(json.dumps({q:tokenizer(q,padding='max_length',max_length=77,truncation=True)['input_ids']for q in queries}))
from skimage import data
from PIL import Image
for name,loader in [('a',data.chelsea),('b',data.coffee),('c',data.astronaut),('d',data.rocket)]:
    Image.fromarray(loader()).save(testassets/f'{name}.jpg')
# A labeled scene montage, NOT evidence of action recognition. No audio or text.
import subprocess,imageio_ffmpeg
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loop','1','-t','4','-i',str(testassets/'a.jpg'),'-loop','1','-t','4','-i',str(testassets/'b.jpg'),'-loop','1','-t','4','-i',str(testassets/'c.jpg'),'-filter_complex','[0:v]scale=384:384,setsar=1[v0];[1:v]scale=384:384,setsar=1[v1];[2:v]scale=384:384,setsar=1[v2];[v0][v1][v2]concat=n=3:v=1:a=0[v]','-map','[v]','-r','12','-c:v','libx264','-pix_fmt','yuv420p',str(testassets/'m0.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
(testassets/'corpus.json').write_text(json.dumps({'source':'scikit-image sample photographs; see https://scikit-image.org/docs/stable/api/skimage.data.html','images':{'a.jpg':'cat','b.jpg':'coffee','c.jpg':'astronaut','d.jpg':'rocket'},'video':'m0.mp4 is a synthetic montage, not a real action video','intervals_ms':[[0,4000,'cat'],[4000,8000,'coffee'],[8000,12000,'astronaut']]}))

subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loop','1','-t','12','-i',str(testassets/'d.jpg'),'-vf','scale=384:384','-r','12','-c:v','libx264','-pix_fmt','yuv420p',str(testassets/'m1.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
