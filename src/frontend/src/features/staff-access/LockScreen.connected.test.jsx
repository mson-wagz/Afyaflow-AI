import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, afterEach } from 'vitest';
vi.mock('../../api/client.js',async importOriginal=>({...await importOriginal(),useBackend:true}));
import App from '../../App.jsx';
import { SYNTHETIC_STAFF_FIXTURES } from '../../../../shared/contracts/auth.js';
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});
test('A server-rejected PIN stays on the lock screen and permits a successful retry',async()=>{
  localStorage.clear();
  const {pin:_pin,...staff}=SYNTHETIC_STAFF_FIXTURES[1];
  let unlocks=0;
  vi.stubGlobal('fetch',vi.fn(async(path,options)=>{
    if(path==='/api/auth/me')return Response.json({staff,locked:true});
    if(path==='/api/audit')return Response.json([]);
    if(path==='/api/auth/unlock') {
      unlocks++;
      const {pin}=JSON.parse(options.body);
      return pin==='2345'?Response.json({success:true,staff}):Response.json({code:'INVALID_PIN',message:'Incorrect PIN.'},{status:401});
    }
    if(path==='/api/research/cases')return Response.json({metadata:{description:'Historical research',limitations:[]},total:0,subjects:0,cases:[]});
    throw new Error(`Unexpected request: ${path}`);
  }));
  render(<App />);
  const field=await screen.findByLabelText('Enter 4-digit Staff PIN');
  fireEvent.change(field,{target:{value:'0000'}});
  fireEvent.click(screen.getByRole('button',{name:'Unlock Session'}));
  expect(await screen.findByText('Incorrect PIN. Please re-enter your PIN.')).toBeInTheDocument();
  expect(screen.getByRole('heading',{name:'Terminal Locked'})).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'Staff Sign In'})).not.toBeInTheDocument();
  expect(field).toHaveValue('');expect(field).toHaveFocus();
  fireEvent.change(field,{target:{value:'2345'}});
  fireEvent.click(screen.getByRole('button',{name:'Unlock Session'}));
  await waitFor(()=>expect(screen.queryByRole('heading',{name:'Terminal Locked'})).not.toBeInTheDocument());
  expect(await screen.findByText(/No historical cases have been imported/)).toBeInTheDocument();
  expect(unlocks).toBe(2);
});
