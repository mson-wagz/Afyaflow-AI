import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, test, expect } from 'vitest';
import { SESSION_STATUS } from '../../shared/contracts/auth.js';
const state=vi.hoisted(()=>({auth:{staff:{id:'STAFF-102',name:'Demo clinician',role:'clinician'},sessionStatus:'LOCKED',isClinical:true}}));
vi.mock('./features/staff-access',()=>({
  AuthProvider:({children})=>children,useAuth:()=>state.auth,
  SignInScreen:()=>null,LockScreen:()=> <p>Demo terminal locked</p>,StaffProfileModal:()=>null,SecurityAuditView:()=>null,
}));
vi.mock('./offline',()=>({SyncProvider:({children})=>children,useOfflineSync:()=>({isOnline:true,pendingCount:0}),OfflineSyncView:()=>null}));
vi.mock('./api/client.js',async importOriginal=>({...await importOriginal(),useBackend:true,api:vi.fn()}));
import { api } from './api/client.js';
import App from './App.jsx';
test('Restoring a locked session defers research requests and loads the library after unlock',async()=>{
  state.auth.sessionStatus=SESSION_STATUS.LOCKED;
  api.mockResolvedValue({metadata:{description:'De-identified historical records',limitations:[]},total:0,subjects:0,cases:[]});
  const view=render(<App />);
  expect(screen.getByText('Demo terminal locked')).toBeInTheDocument();
  expect(api).not.toHaveBeenCalled();
  state.auth.sessionStatus=SESSION_STATUS.AUTHENTICATED;
  view.rerender(<App />);
  expect(await screen.findByText(/No historical cases have been imported/)).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith('/research/cases');
});
