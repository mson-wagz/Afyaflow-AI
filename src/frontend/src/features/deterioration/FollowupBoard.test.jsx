import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {test,expect,vi,beforeEach} from 'vitest';
import FollowupBoard from './FollowupBoard.jsx';
vi.mock('../../api/client.js',()=>({api:vi.fn(),mutation:vi.fn()}));
import {api,mutation} from '../../api/client.js';
const currentStaff={id:'STAFF-101',name:'Synthetic nurse'};
let task;
beforeEach(()=>{
  vi.clearAllMocks();
  task={id:'FOLLOWUP-test',patient_name:'Synthetic case',status:'PROPOSED',version:1,run_status:'REVIEW_REQUIRED',
    observation_version:1,latest_version:1,latest_vitals:{},needsNewObservation:true,
    basis:{kind:'INCOMPLETE_REVIEW',missingEvidence:['heartRate'],context:{latest:{id:'OBS-1'}}}};
  api.mockImplementation(async path=>path==='/followups'?{snapshotAt:new Date().toISOString(),tasks:[task]}:
    path==='/followups/staff'?[{...currentStaff,role:'nurse'}]:[]);
  mutation.mockImplementation(async(_path,body)=>{
    const status={APPROVE:'OPEN',ACKNOWLEDGE:'ACKNOWLEDGED',COMPLETE:'COMPLETED'}[body.action];
    task={...task,status,version:task.version+1,owner_id:currentStaff.id,owner_name:currentStaff.name,due_at:body.dueAt || task.due_at};
    return {success:true};
  });
});
test('staff explicitly choose time, acknowledge ownership and require newer evidence for completion',async()=>{
  render(<FollowupBoard currentStaff={currentStaff} isClinical />);
  const approve=await screen.findByRole('button',{name:'Approve Follow-up'});expect(approve).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Staff-selected due time'),{target:{value:'2030-01-01T10:30'}});
  fireEvent.change(screen.getByLabelText('Review / completion reason'),{target:{value:'Synthetic staff-selected example interval.'}});
  fireEvent.click(approve);
  await waitFor(()=>expect(mutation).toHaveBeenCalledWith('/followups/FOLLOWUP-test/actions',expect.objectContaining({action:'APPROVE',ownerId:'STAFF-101',expectedVersion:1})));
  fireEvent.click(await screen.findByRole('button',{name:'Acknowledge Ownership'}));
  expect(await screen.findByRole('button',{name:'Complete with observation v1'})).toBeDisabled();
  task={...task,latest_version:2,latest_vitals:{heartRate:80},needsNewObservation:false};
  fireEvent.click(screen.getByRole('button',{name:'Refresh Follow-ups'}));
  const complete=await screen.findByRole('button',{name:'Complete with observation v2'});
  fireEvent.change(screen.getByLabelText('Review / completion reason'),{target:{value:'Reviewed newly recorded observations.'}});
  fireEvent.click(complete);
  await waitFor(()=>expect(mutation).toHaveBeenCalledWith('/followups/FOLLOWUP-test/actions',expect.objectContaining({action:'COMPLETE',observationVersion:2,expectedVersion:3})));
  expect(await screen.findByText(/No active follow-ups/)).toBeInTheDocument();
});
test('nonclinical staff cannot load task or owner data',()=>{
  render(<FollowupBoard currentStaff={{id:'clerk'}} isClinical={false} />);
  expect(api).not.toHaveBeenCalled();expect(screen.queryByText('Active Reassessment Copilot')).not.toBeInTheDocument();
});
