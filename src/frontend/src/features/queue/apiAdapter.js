import * as demo from './demoAdapter.js';
import { api, useBackend } from '../../api/client.js';
import { isDemoOnline } from '../../demo/store.js';
export const apiFetchQueueData=(failure=false)=> {
  if(!useBackend) return demo.apiFetchQueueData(failure);
  if(failure || !isDemoOnline()) return Promise.reject(new Error('Queue connection unavailable. Showing the last confirmed snapshot.'));
  return api('/queue');
};
