import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { calculateSatsScore, TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';
import TriageView from './TriageView.jsx';

const mocked=vi.hoisted(()=>({pending:[],get:vi.fn(),submit:vi.fn()}));
vi.mock('./apiAdapter',()=>({
  apiGetPendingTriageProposals:()=>mocked.get(),
  apiSubmitClinicalDecision:(staff,payload)=>mocked.submit(staff,payload),
  apiGetTriageDecisionHistory:()=>[],
}));
beforeEach(()=>{
  const observations={heartRate:75,systolicBp:120,respiratoryRate:16,temperature:37,avpu:'Alert'};
  mocked.pending=[{patientId:'SYN-test',patientName:'Synthetic Request Fixture',age:30,gender:'Female',
    proposalId:'PROP-server-context',observationVersion:4,arrivalTime:new Date().toISOString(),observations,
    proposal:calculateSatsScore(observations),protocol:{name:'Synthetic fixture',version:'demo-v1'},
    toolTrace:{runId:'RUN-server-context',model:'test double',timestamp:new Date().toISOString(),toolCalls:[]}}];
  mocked.get.mockReset().mockImplementation(async()=>mocked.pending);
  mocked.submit.mockReset().mockImplementation(async(_staff,payload)=>{
    mocked.pending=[];
    return {success:true,data:{...payload,patientName:'Synthetic Request Fixture',priority:TRIAGE_PRIORITY.ORANGE,
      clinicianName:'Jane',clinicianRole:'nurse',timestamp:new Date().toISOString(),decisionId:'DEC-test'}};
  });
});
describe('Server proposal context on clinical decisions',()=>{
  it('keeps an open override bound to its original patient when the proposal list refreshes',async()=>{
    render(<TriageView currentStaff={{id:'STAFF-101',name:'Jane',role:'nurse'}} isClinical={true}/>);
    fireEvent.click(await screen.findByRole('button',{name:/Clinical Override Priority/i}));
    const original=mocked.pending[0];
    mocked.pending=[{...original,patientId:'SYN-next',patientName:'Next Patient Fixture',proposalId:'PROP-next'}];
    await act(async()=>{window.dispatchEvent(new Event('afyaflow-demo-change'));});
    await waitFor(()=>expect(screen.getByRole('heading',{name:/Next Patient Fixture/i})).toBeInTheDocument());
    const dialog=screen.getByRole('dialog');
    expect(within(dialog).getByText('Synthetic Request Fixture')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'Synthetic clinician review'}});
    fireEvent.click(within(dialog).getByRole('button',{name:'Confirm Override'}));
    await screen.findByRole('status');
    expect(mocked.submit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({patientId:'SYN-test',proposalId:'PROP-server-context'}));
  });
  for(const action of ['APPROVED','OVERRIDDEN','REJECTED']) {
    it(`includes the proposal and observation version when ${action.toLowerCase()}`,async()=>{
      render(<TriageView currentStaff={{id:'STAFF-101',name:'Jane',role:'nurse'}} isClinical={true}/>);
      const approve=await screen.findByRole('button',{name:/Approve Proposed Priority/i});
      if(action==='APPROVED')fireEvent.click(approve);
      else {
        fireEvent.click(screen.getByRole('button',{name:action==='OVERRIDDEN'?/Clinical Override Priority/i:/Reject Proposal/i}));
        const dialog=screen.getByRole('dialog');
        fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'Synthetic review justification'}});
        fireEvent.click(within(dialog).getByRole('button',{name:action==='OVERRIDDEN'?'Confirm Override':'Confirm Rejection'}));
      }
      await screen.findByRole('status');
      expect(mocked.submit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({
        patientId:'SYN-test',proposalId:'PROP-server-context',observationVersion:4,
        toolTraceId:'RUN-server-context',decision:action,
      }));
    });
  }
});
