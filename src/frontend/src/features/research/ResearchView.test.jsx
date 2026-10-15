import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
vi.mock('../../api/client.js',()=>({useBackend:true,api:vi.fn(),mutation:vi.fn()}));
import { api, mutation } from '../../api/client.js';
import ResearchView from './ResearchView.jsx';
const metadata={description:'De-identified historical hospital records',sourceUrl:'https://physionet.org',licenseUrl:'https://opendatacommons.org',citation:'Source citation',notice:'ODbL notice',limitations:['Research only']};
const record={id:'MIMIC-ED-example',name:'Historical case example',gender:'Female',age:null,presentingComplaint:'Source headache',vitals:{temperature:37,heartRate:75},
  source:{originalArrival:'2150-01-01',sourceAcuity:3,warnings:[],raw:{triage:{temperature:'98.6'}}},run:null,proposal:null,trace:null};
beforeEach(()=>{
  vi.resetAllMocks();
  api.mockImplementation(async path=>path==='/research/cases'?{metadata,total:222,subjects:64,cases:[record]}:record);
  mutation.mockResolvedValue({success:true});
});
test('Historical cases show source labels, missing observations and licence/export links without automatic inference',async()=>{
  render(<ResearchView isClinical />);
  expect(await screen.findByText('Historical case example')).toBeInTheDocument();
  expect(screen.getByText(/222 ED stays/)).toBeInTheDocument();
  expect(screen.getByText(/Not available in imported ED tables/)).toBeInTheDocument();
  expect(screen.getAllByText('Not recorded')).toHaveLength(6);
  expect(screen.getByRole('link',{name:/Download adapted/})).toHaveAttribute('href','/api/research/export');
  expect(screen.getByRole('link',{name:/licence/})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Request AI research review'})).toBeEnabled();
  expect(mutation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Request AI research review'}));
  await waitFor(()=>expect(mutation).toHaveBeenCalledWith('/visits/MIMIC-ED-example/assessment',{}));
  expect(screen.queryByRole('button',{name:/approve|transfer|override/i})).not.toBeInTheDocument();
});
test('Clerks can inspect cases but cannot request paid research inference',async()=>{
  render(<ResearchView isClinical={false} />);
  expect(await screen.findByRole('button',{name:'Request AI research review'})).toBeDisabled();
  expect(mutation).not.toHaveBeenCalled();
});
test('Saved missing-evidence reviews display no assigned priority and do not request another run',async()=>{
  const reviewed={...record,run:{id:'run',status:'REVIEW_REQUIRED',provider:'openai',model:'test-model'},
    proposal:{summary:'Age and AVPU unavailable',proposal:{missingEvidence:['age','avpu'],priority:null}},trace:{toolCalls:[]}};
  api.mockImplementation(async path=>path==='/research/cases'?{metadata,total:1,subjects:1,cases:[record]}:reviewed);
  render(<ResearchView isClinical />);
  expect(await screen.findByText('Age and AVPU unavailable')).toBeInTheDocument();
  expect(screen.getByText(/REVIEW_REQUIRED/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Research review saved'})).toBeDisabled();
  expect(mutation).not.toHaveBeenCalled();
});
