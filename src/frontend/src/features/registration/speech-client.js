import {MAX_AUDIO_SECONDS,validateSpeechSamples} from '../../../../shared/contracts/voice.js';
export function createSpeechWorker(message,error) {
  const worker=new Worker(new URL('./speech.worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>message(event.data);worker.onerror=error;return worker;
}
export async function decodeSpeech(blob) {
  if(blob.size>5*1024*1024)throw new Error('Use an audio clip smaller than 5 MB.');
  const Audio=window.AudioContext || window.webkitAudioContext;
  if(!Audio || !window.OfflineAudioContext)throw new Error('This browser cannot decode local audio. Use typed intake.');
  const context=new Audio();
  try {
    const buffer=await context.decodeAudioData(await blob.arrayBuffer());
    if(buffer.duration>MAX_AUDIO_SECONDS || buffer.duration<0.25)throw new Error('Use a speech clip between 0.25 and 20 seconds.');
    const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*16000),16000);
    const source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();
    const rendered=await offline.startRendering(),samples=new Float32Array(rendered.getChannelData(0));
    validateSpeechSamples(samples);return samples;
  } finally {await context.close();}
}
