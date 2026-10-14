import { createDemoState } from './fixtures.js';
import { isClinicalRole } from '../../../shared/contracts/auth.js';

export const DEMO_STORAGE_KEY = 'afyaflow_demo_workflow_v1';
let simulatedOffline = false;

export function setDemoOffline(value) { simulatedOffline = value; }
export function isDemoOnline() {
  return !simulatedOffline && (typeof navigator === 'undefined' || navigator.onLine);
}

// Read fresh on each operation so reloads and other tabs see the persisted state.
export function readDemoState() {
  const stored = localStorage.getItem(DEMO_STORAGE_KEY);
  if (stored) return JSON.parse(stored);
  const state = createDemoState();
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  return state;
}

// One synchronous storage write commits both the visit and its audit record.
export function updateDemoState(update) {
  const state = readDemoState();
  const result = update(state);
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('afyaflow-demo-change'));
  return result;
}

export function clinicalActionError(staff) {
  if (!staff || !isClinicalRole(staff.role)) return {
    status: 403, code: 'PERMISSION_DENIED',
    message: `Clinical approval authority required. Role "${staff?.role || 'Guest'}" cannot commit clinical decisions.`,
  };
  if (!isDemoOnline()) return {
    status: 503, code: 'OFFLINE_ACTION_BLOCKED',
    message: 'Clinical decisions require active online connectivity. No decision was saved.',
  };
  return null;
}
