import React from 'react';
import {render,screen,fireEvent,act} from '@testing-library/react';
import {test,expect,vi,afterEach} from 'vitest';
import EvidenceChecklist from './EvidenceChecklist.jsx';
import {evidenceChecklist} from '../../../../shared/contracts/evidence.js';
import AgentWorkflowPanel from './AgentWorkflowPanel.jsx';
vi.mock('../../api/client.js',()=>({api:vi.fn(),mutation:vi.fn()}));
import {api,mutation} from '../../api/client.js';

const protocol={id:'synthetic-test',version:'test-v1',requiredFields:['heartRate','avpu']};
afterEach(()=>vi.restoreAllMocks());
test('checklist names missing evidence, source rules and role-restricted recording',()=>{
  const report=evidenceChecklist({age:30,vitals:{heartRate:75},version:2},protocol),record=vi.fn();
  const view=render(<EvidenceChecklist report={report} onRecord={record} />);
  expect(screen.getByText(/Consciousness .*Missing/)).toBeInTheDocument();
  expect(screen.getByText(/do not infer it from the complaint/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Record Missing Evidence'})).toBeDisabled();
  view.rerender(<EvidenceChecklist report={report} onRecord={record} isClinical />);
  fireEvent.click(screen.getByRole('button',{name:'Record Missing Evidence'}));expect(record).toHaveBeenCalledOnce();
  expect(screen.getByText(/synthetic-test@test-v1 #\/requiredFields\/1/)).toBeInTheDocument();
});

test('background refresh cannot silently apply old form values to a new observation version',async()=>{
  let poll;
  const schedule=globalThis.setInterval;
  vi.spyOn(globalThis,'setInterval').mockImplementation((fn,delay,...args)=>{
    if(delay===3000){poll=fn;return 123;}
    return schedule(fn,delay,...args);
  });
  let visit={id:'SYN-test',name:'Synthetic test',observationVersion:1,vitals:{systolicBp:120}};
  api.mockImplementation(async path=>path==='/visits'?[visit]:[]);mutation.mockResolvedValue({success:true});
  render(<AgentWorkflowPanel isClinical />);
  fireEvent.click(await screen.findByRole('button',{name:'Record New Observations'}));
  expect(screen.getByLabelText('Heart Rate (bpm)')).toHaveValue(null);
  visit={...visit,observationVersion:2,vitals:{systolicBp:125,heartRate:88}};
  await act(async()=>{await poll();});
  expect(screen.getByText(/This form was opened at version 1/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Save Observation Version'})).toBeDisabled();
  expect(screen.getByLabelText('Heart Rate (bpm)')).toHaveValue(null);
  fireEvent.click(screen.getByRole('button',{name:'Record New Observations'}));
  expect(screen.getByLabelText('Heart Rate (bpm)')).toHaveValue(88);
  fireEvent.click(screen.getByRole('button',{name:'Save Observation Version'}));
  await act(async()=>{});
  expect(mutation).toHaveBeenCalledWith('/visits/SYN-test/observations',expect.objectContaining({expectedVersion:2}));
});
