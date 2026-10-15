import React,{useEffect,useRef,useState} from 'react';
import {Card,Button,Alert} from '../../components';
import {speechCandidates,SPEECH_MODEL} from '../../../../shared/contracts/voice.js';
import {createSpeechWorker,decodeSpeech} from './speech-client.js';

export default function VoiceIntake({onApply,allowVitals=false}) {
  const [language,setLanguage]=useState('en'),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false);
  const [status,setStatus]=useState(''),[error,setError]=useState(''),[original,setOriginal]=useState(''),[english,setEnglish]=useState(''),[reviewed,setReviewed]=useState(false),[selected,setSelected]=useState({}),[audioUrl,setAudioUrl]=useState('');
  const worker=useRef(null),job=useRef(0),alive=useRef(true),held=useRef(false),acquiring=useRef(false),recorder=useRef(null),stream=useRef(null),timer=useRef(null);
  const stopTracks=()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};
  const stop=()=>{
    held.current=false;clearTimeout(timer.current);
    if(recorder.current?.state==='recording') {if(alive.current)setBusy(true);recorder.current.stop();}
    stopTracks();
  };
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop();worker.current?.terminate();};},[]);
  useEffect(()=>()=>{if(audioUrl)URL.revokeObjectURL(audioUrl);},[audioUrl]);
  useEffect(()=>{setReviewed(false);setSelected({});},[original,english]);
  const fail=message=>{if(alive.current){setBusy(false);setError(message);setRecording(false);}};
  const getWorker=()=>{
    if(!worker.current)worker.current=createSpeechWorker(data=>{
      if(!alive.current || data.id!==job.current)return;
      if(data.type==='progress')setStatus(`Downloading local speech model: ${data.progress}%`);
      if(data.type==='ready'){setReady(true);setBusy(false);setStatus('Speech model ready.');}
      if(data.type==='result'){setOriginal(data.original);setEnglish(data.english);setBusy(false);setStatus('Review the transcript and every proposed field before applying.');}
      if(data.type==='error'){fail(data.message);worker.current?.terminate();worker.current=null;setReady(false);}
    },()=>{if(!alive.current)return;fail('Local speech worker stopped. Use typed intake or reload the speech model.');worker.current?.terminate();worker.current=null;setReady(false);});
    return worker.current;
  };
  const load=()=>{setBusy(true);setError('');setStatus('Loading speech model. Initial download may take a few minutes.');getWorker().postMessage({id:++job.current,type:'load'});};
  const processAudio=async blob=>{
    setBusy(true);setError('');setRecording(false);setReviewed(false);setSelected({});
    setOriginal('');setEnglish('');setAudioUrl(URL.createObjectURL(blob));setStatus('Processing speech locally…');
    const id=++job.current;
    try {const samples=await decodeSpeech(blob);if(!alive.current || id!==job.current)return;
      getWorker().postMessage({id,type:'transcribe',samples,language},[samples.buffer]);
    }catch(e){fail(e.message);}
  };
  const start=async()=>{
    if(!ready || busy || recorder.current || acquiring.current)return;
    held.current=true;acquiring.current=true;setError('');setStatus('Allow microphone access, then hold again if needed.');
    const generation=job.current;
    try {
      const media=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!alive.current || !held.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;const chunks=[],capture=new MediaRecorder(media);recorder.current=capture;
      capture.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      capture.onstop=()=>{recorder.current=null;stopTracks();if(alive.current && generation===job.current)processAudio(new Blob(chunks,{type:capture.mimeType}));};
      capture.start();setRecording(true);setStatus('Recording locally. Release to transcribe.');timer.current=setTimeout(stop,20000);
    } catch {stopTracks();fail('Microphone unavailable or permission denied. Upload a short clip or use typed intake.');}
    finally {acquiring.current=false;}
  };
  const cancel=()=>{job.current++;stop();worker.current?.terminate();worker.current=null;setReady(false);setBusy(false);setOriginal('');setEnglish('');setReviewed(false);setAudioUrl('');setStatus('Speech draft cleared. Typed intake remains available.');};
  const report=speechCandidates(original,english);
  const apply=()=>{
    if(!reviewed || english.trim().length<3 || busy)return;
    const values={presentingComplaint:english.trim()};
    if(allowVitals)for(const field of report.candidates)if(!field.blocked && selected[field.key])values[field.key]=field.value;
    onApply(values,{method:'LOCAL_SPEECH_REVIEWED',language,modelId:SPEECH_MODEL.id,modelRevision:SPEECH_MODEL.revision,reviewed:true});
    setStatus('Reviewed fields applied to the intake draft. Confirm registration separately.');setReviewed(false);
  };
  return <Card title="Voice-assisted intake" subtitle="English / Kiswahili · Local speech processing · Staff-reviewed fields">
    <details><summary>Open voice intake</summary>
      <p>Audio stays in this browser. The first load downloads public speech-model assets. Registered, reviewed text follows the app’s normal backend and AI workflow. Use fictional information for this prototype.</p>
      <label>Spoken language<select className="form-select" disabled={busy || recording} value={language} onChange={e=>{job.current++;stop();setLanguage(e.target.value);setOriginal('');setEnglish('');setAudioUrl('');}}>
        <option value="en">English</option><option value="sw">Kiswahili / Swahili-led mixed speech</option>
      </select></label>
      {!ready && <Button disabled={busy} onClick={load}>Load Local Speech Model</Button>}
      <Button disabled={!ready || busy} onPointerDown={e=>{e.currentTarget.setPointerCapture?.(e.pointerId);start();}} onPointerUp={stop} onPointerCancel={stop} onBlur={stop}
        onKeyDown={e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)start();}}} onKeyUp={e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();stop();}}}>
        {recording?'Recording — release to transcribe':'Hold to Record (20 seconds max)'}
      </Button>
      <label>Or choose a short audio clip<input type="file" accept="audio/*" disabled={!ready || busy || recording} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)processAudio(file);}}/></label>
      <Button variant="outline" onClick={cancel}>Clear Speech Draft / Stop</Button>
      {status && <p role="status">{status}</p>}{error && <Alert variant="warning">{error}</Alert>}
      {audioUrl && <audio controls src={audioUrl} aria-label="Review original audio" />}
      {(original || english) && <div style={{display:'grid',gap:'0.75rem',marginTop:'1rem'}}>
        <label>Original transcript — review and correct<textarea className="form-input" rows={3} maxLength={2000} value={original} onChange={e=>setOriginal(e.target.value)}/></label>
        <label>English complaint — review translation<textarea className="form-input" rows={3} maxLength={2000} value={english} onChange={e=>setEnglish(e.target.value)}/></label>
        <p>Check every negation and number against the audio. Speech quality is not clinically validated; mixed speech and background noise can cause errors. Age, consciousness and mobility are never inferred.</p>
        {report.numberMismatch && <Alert variant="warning">Numbers differ between the transcript and English text. Enter measurements manually after checking the audio.</Alert>}
        {report.candidates.map((field,index)=><label key={`${field.key}-${index}`}>
          <input type="checkbox" disabled={!allowVitals || field.blocked} checked={Boolean(selected[field.key]) && !field.blocked} onChange={e=>setSelected({...selected,[field.key]:e.target.checked})}/>
          {' '}{field.label}: {field.value} · Source: “{field.source}” {field.blocked?'— manual entry required':''}
        </label>)}
        <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I checked the original audio, transcript, translation and each selected measurement.</label>
        <Button disabled={!reviewed || busy || english.trim().length<3} onClick={apply}>Apply Reviewed Fields to Draft</Button>
      </div>}
      <p>Typed registration remains available below. Applying speech does not register a visit or assign a priority.</p>
    </details>
  </Card>;
}
