import {pipeline,env} from '@huggingface/transformers';
import {SPEECH_MODEL,validateSpeechSamples} from '../../../../shared/contracts/voice.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
let transcriber;
async function load(id) {
  transcriber ||= pipeline('automatic-speech-recognition',SPEECH_MODEL.id,{revision:SPEECH_MODEL.revision,
    device:'wasm',dtype:'q8',progress_callback:p=>{
      if(p.status==='progress')self.postMessage({id,type:'progress',progress:Math.round(p.progress || 0)});
    }});
  return transcriber;
}
self.onmessage=async({data})=>{
  const {id,type,samples,language}=data;
  try {
    if(type==='load') {await load(id);self.postMessage({id,type:'ready'});return;}
    if(type!=='transcribe' || !['en','sw'].includes(language))throw new Error('Unsupported speech request.');
    validateSpeechSamples(samples);
    const model=await load(id),options={language:language==='sw'?'swahili':'english',max_new_tokens:256};
    const original=await model(samples,{...options,task:'transcribe'});
    const translation=language==='sw'?await model(samples,{...options,task:'translate'}):original;
    if(!original.text?.trim() || !translation.text?.trim() || original.text.length>2000 || translation.text.length>2000)throw new Error('No usable short speech.');
    self.postMessage({id,type:'result',original:original.text.trim(),english:translation.text.trim(),model:SPEECH_MODEL});
  } catch {
    self.postMessage({id,type:'error',message:'Local speech processing is unavailable or the clip could not be read. Use typed intake or retry with clear speech.'});
  }
};
