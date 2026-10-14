export function decisionFailureMessage(error, action = 'override') {
  if(error?.code === 'PERMISSION_DENIED') {
    return `You’re not authorised to ${action} patient priorities. Please ask a nurse or clinician with approval access to review this case.`;
  }
  if(error?.code === 'SESSION_LOCKED') return 'Your session is locked. Please unlock the terminal before trying again.';
  if(error?.status === 401) return 'Please sign in with an authorised clinical account before continuing.';
  if(error?.code === 'OFFLINE_ACTION_BLOCKED') return 'Your decision was not saved because you are offline. Please reconnect and try again.';
  return error?.message || 'Your decision could not be saved. Please try again.';
}
