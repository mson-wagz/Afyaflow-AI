import React from 'react';
import { Button } from '../../components';

export default function EvidenceChecklist({report,isClinical,onRecord}) {
  if(!report)return null;
  return <section aria-label="Missing-evidence assistant" style={{marginTop:'1rem',padding:'1rem',border:'1px solid var(--color-border)',borderRadius:'8px'}}>
    <h3>Evidence needed for this assessment</h3>
    <p>Observation version {report.observationVersion} · {report.protocolId} ({report.protocolVersion})</p>
    {!report.supportedPopulation && <p role="alert">Population eligibility is missing or unsupported. Manual clinical review is required.</p>}
    <ul style={{listStyle:'none',padding:0}}>
      {report.items.filter(item=>item.required).map(item=><li key={item.key} style={{padding:'0.6rem 0',borderBottom:'1px solid #e2e8f0'}}>
        <strong>{item.label || item.key}: {item.status==='PRESENT'?'Recorded':item.status==='UNSUPPORTED'?'Unsupported':'Missing'}</strong>
        {item.value!==null && <span> — {String(item.value)} {item.unit}</span>}
        {item.action && <div>{item.action}</div>}
        <small>Source rule: {item.citation.protocolId}@{item.citation.version} {item.citation.pointer}</small>
      </li>)}
    </ul>
    <p>{report.missingRequired.length?`${report.missingRequired.length} required fields need recording. No values have been estimated.`:'All core fields are recorded. Staff review is still required.'}</p>
    {report.missingRequired.length>0 && onRecord && <Button variant="outline" disabled={!isClinical} onClick={onRecord}>Record Missing Evidence</Button>}
    <details><summary>Additional observations</summary>
      <p>These are not core requirements of the synthetic fixture. Record them when appropriate; missing values remain unknown.</p>
      <ul>{report.items.filter(item=>!item.required).map(item=><li key={item.key}>{item.label}: {item.status==='MISSING'?'Not recorded':`${item.value} ${item.unit}`}</li>)}</ul>
    </details>
    <small>The cited rules belong to an unvalidated synthetic fixture.</small>
  </section>;
}
