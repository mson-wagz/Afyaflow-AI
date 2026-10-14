import * as demo from './demoAdapter.js';
import { api, mutation, useBackend } from '../../api/client.js';
import { isDemoOnline } from '../../demo/store.js';
export async function apiRegisterPatient(data,key) {
  if(!useBackend) return demo.apiRegisterPatient(data,key);
  if(!isDemoOnline()) return {success:false,error:'Save an offline draft and reconnect to register.'};
  try {return await mutation('/visits',data,key);} catch(error) {return {success:false,error:error.message};}
}
export const apiGetRegisteredVisits=()=>useBackend?api('/visits'):demo.apiGetRegisteredVisits();
