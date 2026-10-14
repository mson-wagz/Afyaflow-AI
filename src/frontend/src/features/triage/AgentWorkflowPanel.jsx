import React, { useEffect, useState } from 'react';
import { api, mutation } from '../../api/client.js';
import { Card, Button, Alert, Modal } from '../../components';
import { isDemoOnline } from '../../demo/store.js';

const measurements=[['systolicBp','Systolic BP (mmHg)'],['diastolicBp','Diastolic BP (mmHg)'],
  ['heartRate','Heart Rate (bpm)'],['respiratoryRate','Respiratory Rate (/min)'],['temperature','Temperature (°C)'],['spO2','Oxygen Saturation (%)']];

export default function AgentWorkflowPanel({isClinical}) {
  const [visits,setVisits]=useState([]),[runs,setRuns]=useState([]),[selected,setSelected]=useState('');
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [trace,setTrace]=useState(null),[editing,setEditing]=useState(false),[vitals,setVitals]=useState({});
  const [reason,setReason]=useState(''),[manualPriority,setManualPriority]=useState('RED');
  const visit=visits.find(v=>v.id===selected) || visits[0];
  const load=async () => {
    try {const [v,r]=await Promise.all([api('/visits'),api('/agents/runs')]);setVisits(v);setRuns(r);setError('');}
    catch(e){setError(e.message);}
  };
  useEffect(()=>{load();const timer=setInterval(load,3000);return ()=>clearInterval(timer);},[]);
  const perform=async task => {
    if(!isDemoOnline()){setError('This action requires online connectivity.');return;}
    setBusy(true);setError('');setMessage('');
    try {await task();await load();}catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <Card title="Agent Assessment & Observation Capture" subtitle="Amazon Bedrock • PostgreSQL-backed jobs • Tool evidence • Human approval gate">
    {error && <Alert variant="danger" title="Assessment action failed">{error}</Alert>}
    {message && <Alert variant="info">{message}</Alert>}
    <label htmlFor="agent-visit">Patient visit</label>
    <select id="agent-visit" className="form-select" value={visit?.id || ''} onChange={e=>{setSelected(e.target.value);setEditing(false);setReason('');}}>
      {visits.map(v=><option key={v.id} value={v.id}>{v.name} — {v.assessmentStatus}</option>)}
    </select>
    {visit && <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',marginTop:'0.75rem'}}>
      <Button disabled={!isClinical || busy} onClick={()=>perform(async()=>{
        await mutation(`/visits/${visit.id}/assessment`,{});setMessage('Assessment queued. The agent will gather evidence and pause for your review.');
      })}>Request Agent Assessment</Button>
      <Button variant="outline" disabled={!isClinical || busy} onClick={()=>{setVitals(visit.vitals || {});setEditing(!editing);}}>Record New Observations</Button>
    </div>}
    {editing && visit && <form onSubmit={e=>{e.preventDefault();perform(async()=>{
      const clean=Object.fromEntries([...measurements.map(([key])=>key),'avpu','mobility'].map(key=>[key,vitals[key] ?? '']));
      await mutation(`/visits/${visit.id}/observations`,{expectedVersion:visit.observationVersion,vitals:clean});
      setEditing(false);setMessage('New observation version saved. Earlier proposals are invalidated and a new assessment is queued.');
    });}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'0.75rem',marginTop:'0.75rem'}}>
        {measurements.map(([key,label])=><label key={key}>{label}<input className="form-input" type="number" step="any" value={vitals[key] ?? ''} onChange={e=>setVitals({...vitals,[key]:e.target.value})}/></label>)}
        <label>Consciousness (AVPU)<select className="form-select" value={vitals.avpu || ''} onChange={e=>setVitals({...vitals,avpu:e.target.value})}>
          <option value="">Not Recorded</option>{['Alert','Voice','Pain','Unresponsive'].map(v=><option key={v}>{v}</option>)}
        </select></label>
        <label>Mobility<select className="form-select" value={vitals.mobility || ''} onChange={e=>setVitals({...vitals,mobility:e.target.value})}>
          <option value="">Not Recorded</option>{['Walking normally','Needs assistance to walk','Immobile / Stretcher'].map(v=><option key={v}>{v}</option>)}
        </select></label>
      </div>
      <Button type="submit" disabled={busy || !isClinical}>Save Observation Version</Button>
    </form>}
    {visit && isClinical && <details style={{marginTop:'0.75rem'}}>
      <summary>Manual assessment when the agent is unavailable</summary>
      <p>A named clinician can record a priority with a reason. This records a human decision, not an agent recommendation.</p>
      <label>Manually assessed priority<select className="form-select" value={manualPriority} onChange={e=>setManualPriority(e.target.value)}>
        {['RED','ORANGE','YELLOW','GREEN'].map(p=><option key={p}>{p}</option>)}
      </select></label>
      <label>Manual assessment reason<textarea className="form-input" value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <Button disabled={busy || reason.trim().length<5} onClick={()=>perform(async()=>{
        await mutation('/deterioration/decisions',{patientId:visit.id,observationVersion:visit.observationVersion,
          action:'ESCALATE',reason,targetPriority:manualPriority});setMessage('Manual clinical assessment confirmed by the server.');setReason('');
      })}>Record Manual Clinical Decision</Button>
    </details>}
    <div style={{overflowX:'auto',marginTop:'1rem'}}>
      <table style={{width:'100%',textAlign:'left',fontSize:'0.85rem'}}>
        <caption style={{textAlign:'left'}}>Persisted agent runs (latest 100)</caption>
        <thead><tr><th>Patient</th><th>Status</th><th>Model</th><th>Review / Failure</th><th>Trace</th></tr></thead>
        <tbody>{runs.map(run=><tr key={run.id}>
          <td>{visits.find(v=>v.id===run.patientId)?.name || run.patientId}</td><td>{run.status}</td><td>{run.model}</td>
          <td>{run.error || (run.status==='WAITING_FOR_REVIEW'?'Awaiting clinician decision':'')}</td>
          <td><Button variant="outline" size="sm" onClick={()=>perform(async()=>setTrace(await api(`/agents/runs/${run.id}`)))}>View Run Trace</Button></td>
        </tr>)}</tbody>
      </table>
    </div>
    {trace && <Modal isOpen={true} onClose={()=>setTrace(null)} title={`Agent run ${trace.runId}`} maxWidth="800px">
      <p>{trace.provider} • {trace.model} • {trace.status}</p>
      {trace.error && <Alert variant="danger">{trace.error}</Alert>}
      <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:'0.8rem'}}>{JSON.stringify(trace.toolCalls,null,2)}</pre>
    </Modal>}
  </Card>;
}
