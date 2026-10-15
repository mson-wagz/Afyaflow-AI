import {validateObservationData} from './patient.js';
export const SPEECH_MODEL={id:'Xenova/whisper-tiny',revision:'5332fcc35e32a33b86612b9a57a89be7906102b1',runtime:'transformers.js-4.3.1'};
export const MAX_AUDIO_SECONDS=20;

// Conservative extraction of explicit digits + named units only, never inferred physiology.
export function speechCandidates(original,english) {
  const numbers=text=>(text.replace(/spo2/gi,'oxygen saturation').match(/\d+(?:\.\d+)?/g) || []).map(Number).sort((a,b)=>a-b);
  const numberMismatch=JSON.stringify(numbers(original))!==JSON.stringify(numbers(english));
  const definitions=[
    ['heartRate','Heart rate (bpm)',/\b(?:heart rate|pulse)\s*(?:is|of|[:=])?\s*(\d+(?:\.\d+)?)\s*(?:bpm|beats (?:per|a) minute)\b/gi],
    ['respiratoryRate','Respiratory rate (/min)',/\b(?:respiratory rate|breathing rate)\s*(?:is|of|[:=])?\s*(\d+(?:\.\d+)?)\s*(?:breaths (?:per|a) minute|\/min)/gi],
    ['temperature','Temperature (°C)',/\btemperature\s*(?:is|of|[:=])?\s*(\d+(?:\.\d+)?)\s*(?:degrees?\s*celsius|°\s*c|celsius)\b/gi],
    ['spO2','Oxygen saturation (%)',/\b(?:oxygen saturation|spo2)\s*(?:is|of|[:=])?\s*(\d+(?:\.\d+)?)\s*(?:%|percent)/gi],
    ['systolicBp','Systolic BP (mmHg)',/\bsystolic(?: blood pressure| bp)?\s*(?:is|of|[:=])?\s*(\d+(?:\.\d+)?)\s*mmhg\b/gi],
    ['diastolicBp','Diastolic BP (mmHg)',/\bdiastolic(?: blood pressure| bp)?\s*(?:is|of|[:=])?\s*(\d+(?:\.\d+)?)\s*mmhg\b/gi],
  ];
  const candidates=[];
  for(const [key,label,pattern] of definitions)for(const match of english.matchAll(pattern)) {
    const value=Number(match[1]);
    const clause=english.slice(0,match.index).split(/[.!?;](?:\s+|$)/).at(-1)+match[0]+
      english.slice(match.index+match[0].length).split(/[.!?;](?:\s+|$)/)[0];
    const uncertain=/\b(?:not|no|maybe|perhaps|about|approximately|unsure|uncertain|unknown|possibly|unconfirmed|incorrect|or|previously|yesterday|baseline|earlier|was)\b/i.test(clause);
    candidates.push({key,label,value,source:match[0],blocked:numberMismatch || uncertain || !validateObservationData({[key]:value}).valid});
  }
  for(const candidate of candidates)if(candidates.filter(c=>c.key===candidate.key).length>1)candidate.blocked=true;
  return {numberMismatch,candidates};
}

export function validateSpeechSamples(samples) {
  if(!(samples instanceof Float32Array) || samples.length<4000 || samples.length>16000*MAX_AUDIO_SECONDS)
    throw new Error('Use a speech clip between 0.25 and 20 seconds.');
  let energy=0;
  for(const value of samples) {if(!Number.isFinite(value))throw new Error('Invalid audio samples.');energy+=value*value;}
  if(Math.sqrt(energy/samples.length)<0.005)throw new Error('No clear audio detected. Re-record or use typed intake.');
}
