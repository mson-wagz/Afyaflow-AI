import React,{useEffect,useState} from 'react';
import {api,mutation} from '../../api/client.js';
import {Card,Button,Alert,Modal} from '../../components';

function Task({task,staff,currentStaff,busy,act,history}) {
  const [owner,setOwner]=useState(task.owner_id || currentStaff.id),[due,setDue]=useState(''),[reason,setReason]=useState('');
  const active=['PROPOSED','OPEN','ACKNOWLEDGED'].includes(task.status),owned=task.owner_id===currentStaff.id;
  const submit=(action,extra={})=>act(task,{action,expectedVersion:task.version,...extra});
  return <article style={{border:`1px solid ${task.overdue?'#dc2626':'#cbd5e1'}`,borderRadius:'8px',padding:'1rem',background:task.overdue?'#fff7f7':'#fff'}} aria-label={`Follow-up for ${task.patient_name}`}>
    <h3>{task.patient_name} <small>{task.overdue?'OVERDUE':task.status}</small></h3>
    <p>{task.basis.kind==='RECORDED_CHANGE'?'Proposed for a recorded-change flag.':'Proposed for incomplete or unsupported evidence.'}</p>
    <p>Based on observation v{task.observation_version} · Latest recorded v{task.latest_version}</p>
    {task.owner_name && <p>Owner: <strong>{task.owner_name}</strong> · Due: {new Date(task.due_at).toLocaleString()} · Approved by {task.approver_name}</p>}
    <details><summary>Review source evidence</summary>
      <p>{task.basis.summary}</p>
      {task.basis.missingEvidence?.length>0 && <p>Missing core fields: {task.basis.missingEvidence.join(', ')}</p>}
      <p>Baseline: {task.basis.context.baseline?`v${task.basis.context.baseline.version} (${task.basis.context.baseline.id})`:'No previous recorded snapshot'} · Latest: {task.basis.context.latest?.id}</p>
      <ul>{task.basis.context.comparison?.triggers.map((flag,index)=><li key={index}>{flag}</li>)}</ul>
      <p>{task.basis.context.ruleCitation}. {task.basis.context.limitation}</p>
      <p>Latest recorded measurements: {Object.entries(task.latest_vitals).map(([key,value])=>`${key}: ${value===null || value===''?'Not recorded':value}`).join(' · ')}</p>
    </details>
    {active && <div style={{display:'grid',gap:'0.65rem',margin:'0.8rem 0'}}>
      <label>Follow-up owner<select className="form-select" value={owner} onChange={e=>setOwner(e.target.value)}>
        {staff.map(person=><option key={person.id} value={person.id}>{person.name} ({person.role})</option>)}
      </select></label>
      {task.status==='PROPOSED' && <label>Staff-selected due time<input className="form-input" type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label>}
      <label>Review / completion reason<textarea className="form-input" value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
        {task.status==='PROPOSED' && <Button disabled={busy || !due || !owner || reason.trim().length<5 || !['WAITING_FOR_REVIEW','REVIEW_REQUIRED','DECIDED'].includes(task.run_status)} onClick={()=>submit('APPROVE',{ownerId:owner,dueAt:new Date(due).toISOString(),reason})}>Approve Follow-up</Button>}
        {task.status==='OPEN' && owned && <Button disabled={busy} onClick={()=>submit('ACKNOWLEDGE')}>Acknowledge Ownership</Button>}
        {task.status==='ACKNOWLEDGED' && owned && <Button disabled={busy || task.needsNewObservation || reason.trim().length<5} onClick={()=>submit('COMPLETE',{observationVersion:task.latest_version,reason})}>Complete with observation v{task.latest_version}</Button>}
        {['OPEN','ACKNOWLEDGED'].includes(task.status) && owner!==task.owner_id && <Button variant="outline" disabled={busy || reason.trim().length<5} onClick={()=>submit('REASSIGN',{ownerId:owner,reason})}>Reassign Owner</Button>}
        <Button variant="outline" disabled={busy || reason.trim().length<5} onClick={()=>submit('CANCEL',{reason})}>{task.status==='PROPOSED'?'Decline Proposal':'Cancel Follow-up'}</Button>
      </div>
      {['OPEN','ACKNOWLEDGED'].includes(task.status) && task.needsNewObservation && <p>Record a newer observation version in Triage & Prioritisation before completing this task.</p>}
    </div>}
    <Button variant="outline" size="sm" disabled={busy} onClick={()=>history(task)}>View Follow-up History</Button>
  </article>;
}

export default function FollowupBoard({currentStaff,isClinical}) {
  const [data,setData]=useState({tasks:[]}),[staff,setStaff]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[closed,setClosed]=useState(false),[history,setHistory]=useState(null);
  const load=async()=>{
    if(!isClinical)return;
    try {const [tasks,people]=await Promise.all([api('/followups'),api('/followups/staff')]);setData(tasks);setStaff(people);setError('');}
    catch(e){setError(e.message);}
  };
  useEffect(()=>{load();if(!isClinical)return;const timer=setInterval(load,10000);return()=>clearInterval(timer);},[isClinical]);
  if(!isClinical)return null;
  const act=async(task,body)=>{
    setBusy(true);setError('');setMessage('');
    try {await mutation(`/followups/${task.id}/actions`,body);await load();setMessage('Follow-up action confirmed. Patient priority has not been changed.');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const openHistory=async task=>{try {setHistory({task,events:await api(`/followups/${task.id}/history`)});}catch(e){setError(e.message);}};
  const tasks=data.tasks.filter(task=>closed || ['PROPOSED','OPEN','ACKNOWLEDGED'].includes(task.status));
  return <Card title="Active Reassessment Copilot" subtitle="Proposed rechecks, named owners and staff-approved due times">
    {error && <Alert variant="danger" title="Follow-up action failed">{error}</Alert>}
    {message && <Alert variant="success">{message}</Alert>}
    <p><strong>{data.tasks.filter(t=>t.overdue).length} overdue</strong> · Last refreshed: {data.snapshotAt?new Date(data.snapshotAt).toLocaleTimeString():'Loading'}</p>
    <p>Proposals are created when an assessment finds incomplete evidence or a synthetic recorded-change flag. Staff choose the timing; the model never schedules or approves a recheck. This board refreshes while open and does not sense vital signs.</p>
    <label><input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)}/> Show closed follow-ups</label>
    <Button variant="outline" size="sm" disabled={busy} onClick={load}>Refresh Follow-ups</Button>
    <div style={{display:'grid',gap:'1rem',marginTop:'1rem'}}>{tasks.map(task=><Task key={`${task.id}:${task.version}`} task={task} staff={staff} currentStaff={currentStaff} busy={busy} act={act} history={openHistory}/>)}</div>
    {!tasks.length && <p>No active follow-ups. Request an agent assessment in Triage & Prioritisation to evaluate recorded evidence.</p>}
    {history && <Modal isOpen title={`Follow-up history: ${history.task.patient_name}`} onClose={()=>setHistory(null)}>
      <ol>{history.events.map(event=><li key={event.id} style={{marginBottom:'1rem'}}>
        <strong>{event.event_type}</strong> · {event.staff_name || 'Agent proposal'} · {new Date(event.timestamp).toLocaleString()}
        {event.details.reason && <p>{event.details.reason}</p>}
        {event.details.completionObservationId && <p>Completion evidence: {event.details.completionObservationId}</p>}
      </li>)}</ol>
    </Modal>}
  </Card>;
}
