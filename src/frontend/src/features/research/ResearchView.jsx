import React, { useEffect, useState } from 'react';
import { api, mutation, useBackend } from '../../api/client.js';
import { Card, Button, Alert } from '../../components';
import './research.css';

const fields=[['heartRate','Heart rate','bpm'],['systolicBp','Systolic BP','mmHg'],
  ['diastolicBp','Diastolic BP','mmHg'],['respiratoryRate','Respiratory rate','breaths/min'],
  ['temperature','Temperature','°C'],['spO2','Oxygen saturation','%'],['avpu','AVPU',''],['mobility','Mobility','']];
const active=status=>['QUEUED','RUNNING'].includes(status);
export default function ResearchView({isClinical}) {
  const [library,setLibrary]=useState(null),[selected,setSelected]=useState(''),[record,setRecord]=useState(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    if(!useBackend)return;
    let current=true;
    api('/research/cases').then(data=>{if(current){setLibrary(data);setSelected(data.cases[0]?.id || '');}})
      .catch(e=>{if(current)setError(e.message);});
    return()=>{current=false;};
  },[]);
  useEffect(()=>{
    if(!selected || !useBackend)return;
    let current=true,timer;
    setRecord(null);setError('');
    const load=async()=>{
      try {
        const data=await api(`/research/cases/${encodeURIComponent(selected)}`);
        if(!current)return;
        setRecord(data);setError('');
        if(active(data.run?.status))timer=setTimeout(load,3000);
      }catch(e){if(current)setError(e.message);}
    };
    load();return()=>{current=false;clearTimeout(timer);};
  },[selected,revision]);
  const requestReview=async()=>{
    setBusy(true);setError('');
    try {await mutation(`/visits/${encodeURIComponent(selected)}/assessment`,{});setRevision(value=>value+1);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  if(!useBackend)return <Card title="Historical research cases"><p>Connect to the backend to explore the MIMIC-IV-ED Demo. Browser-only mode contains synthetic fixtures.</p></Card>;
  const metadata=library?.metadata;
  const filtered=library?.cases.filter(item=>`${item.id} ${item.presentingComplaint}`.toLowerCase().includes(query.toLowerCase())) || [];
  const canRequest=record && (!record.run || record.run.status==='FAILED');
  return <div className="research-view" style={{display:'grid',gap:'1rem'}}>
    <Card title="Historical research cases" subtitle="MIMIC-IV-ED Demo v2.2 · De-identified hospital records · Research and education">
      {error && <Alert variant="danger" title="Research data unavailable">{error}</Alert>}
      {!library && !error && <p role="status">Loading historical cases…</p>}
      {metadata && <>
        <p>{metadata.description}</p>
        <p><strong>{library.total} ED stays · {library.subjects} distinct source patients</strong>. Each case is a historical encounter, not a current admission.</p>
        <p>Registration and hospital workflow screens continue to use synthetic records. Historical cases stay outside the queue, clinical approvals, and department transfers.</p>
        <p><a href={metadata.sourceUrl} target="_blank" rel="noreferrer">Original dataset and citation</a> · <a href={metadata.licenseUrl} target="_blank" rel="noreferrer">ODbL 1.0 licence</a> · <a href="/api/research/export" download>Download adapted dataset (JSON)</a> · <a href="https://github.com/mson-wagz/Afyaflow-AI/blob/main/docs/USER_GUIDE.md#historical-research-cases" target="_blank" rel="noreferrer">User guide</a></p>
        <details><summary>About the data and its limitations</summary><ul>{metadata.limitations.map(item=><li key={item}>{item}</li>)}</ul><p>{metadata.citation}</p><p>{metadata.notice}</p></details>
      </>}
    </Card>
    {library && <Card title="Explore a source case">
      {!library.total?<p>No historical cases have been imported. Ask the operator to run the documented MIMIC demo import.</p>:<>
        <label className="form-label" htmlFor="research-search">Search case ID or complaint</label>
        <input className="form-input" id="research-search" value={query} onChange={event=>setQuery(event.target.value)} style={{width:'100%',marginBottom:'0.75rem'}} />
        <label className="form-label" htmlFor="research-case">Historical encounter ({filtered.length} matches)</label>
        <select className="form-select" id="research-case" value={selected} onChange={event=>setSelected(event.target.value)} style={{width:'100%'}}>
          {!filtered.some(item=>item.id===selected) && selected && <option value={selected}>Selected case: {selected}</option>}
          {filtered.map(item=><option key={item.id} value={item.id}>{item.id} — {item.presentingComplaint.slice(0,100)}</option>)}
        </select>
      </>}
      {selected && !record && !error && <p role="status">Loading case evidence…</p>}
      {record && <section aria-label="Historical case evidence">
        <h3>{record.name}</h3>
        <p><strong>Source complaint:</strong> {record.presentingComplaint}</p>
        <p><strong>Age:</strong> Not available in imported ED tables · <strong>Source gender:</strong> {record.gender}</p>
        <p><strong>Shifted source arrival:</strong> {record.source.originalArrival || 'Not recorded'}. This is not an exact triage measurement time or a current arrival.</p>
        <p><strong>Recorded source ESI:</strong> {record.source.sourceAcuity ?? 'Not recorded'} (1 = highest urgency, 5 = lowest). Kept as a historical reference; it is not converted into an AfyaFlow priority or supplied to the AI as an answer.</p>
        <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><caption>Normalized source observations</caption><thead><tr><th>Observation</th><th>Recorded value</th></tr></thead>
          <tbody>{fields.map(([key,label,unit])=><tr key={key}><th scope="row">{label}</th><td>{record.vitals[key]===undefined?'Not recorded':`${record.vitals[key]} ${unit}`}</td></tr>)}</tbody></table></div>
        <p>Temperature is converted from documented Fahrenheit to Celsius. Unsupported source values remain in the raw data and are excluded from normalized observations.</p>
        {record.source.warnings.length>0 && <Alert variant="warning" title="Source data quality warnings"><ul>{record.source.warnings.map(item=><li key={item}>{item}</li>)}</ul></Alert>}
        <details><summary>Original source rows</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(record.source.raw,null,2)}</pre></details>
      </section>}
    </Card>}
    {record && <Card title="AI research review" subtitle="Uses the existing MCP evidence tools and an unvalidated demonstration protocol">
      <p>Age and AVPU are unavailable, so the current protocol cannot establish a supported population or complete a score. A review should report missing evidence with no assigned priority.</p>
      <p>Requesting a review sends the available complaint and normalized observations to the configured AI provider and may incur API charges. The historical ESI label, disposition, and source identifiers are excluded from model evidence.</p>
      <Button onClick={requestReview} disabled={!isClinical || !canRequest || busy}>{busy?'Requesting…':active(record.run?.status)?'Research review in progress':record.run && record.run.status!=='FAILED'?'Research review saved':'Request AI research review'}</Button>
      {!isClinical && <p>A nurse or clinician account is required to request a review.</p>}
      {record.run && <p role="status">Status: <strong>{record.run.status}</strong> · Provider: {record.run.provider} · Model: {record.run.model}</p>}
      {record.run?.error && <Alert variant="danger" title="Research review failed">{record.run.error}</Alert>}
      {record.proposal && <>
        <p><strong>Research summary:</strong> {record.proposal.summary}</p>
        <p><strong>Missing evidence:</strong> {record.proposal.proposal.missingEvidence.join(', ') || 'None reported'}</p>
        <p><strong>AfyaFlow priority:</strong> {record.proposal.proposal.priority?.code || 'Not assigned'} · Clinical validation: not established.</p>
      </>}
      {record.trace && <details><summary>Research model and MCP trace</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(record.trace,null,2)}</pre></details>}
      <p>Historical cases are read-only. Research reviews cannot approve a priority or route a patient.</p>
    </Card>}
  </div>;
}
