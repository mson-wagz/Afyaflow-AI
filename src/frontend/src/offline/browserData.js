/**
 * Patient data the app keeps in this browser's localStorage, and its removal at sign-out.
 *
 * Retention policy (see docs/SECURITY.md):
 * - Registration drafts and offline-queued registrations belong to the staff member who created
 *   them. Other staff on the same device never see or sync them.
 * - Signing out or switching user removes that staff member's drafts and queued registrations
 *   from the device. Unsynced registrations are only removed after the user confirms.
 * - Locking or server session expiry keeps them (hidden behind sign-in) so work is not lost.
 */
export const REGISTRATION_DRAFT_PREFIX = 'afyaflow_patient_reg_draft_v1';
export const LOCAL_DRAFT_KEY = 'afyaflow_local_draft_v1';
export const SYNC_OUTBOX_KEY = 'afyaflow_sync_outbox_v1';
export const SIGNED_OUT_EVENT = 'afyaflow-signed-out';

export const registrationDraftKey = (staffId) => `${REGISTRATION_DRAFT_PREFIX}_${staffId}`;

/** Queued items belong to their creator; items queued before ownership was recorded are claimable. */
export const ownsItem = (item, staffId) => !item.staffId || item.staffId === staffId;

/** Removes the signed-out staff member's patient data from this browser. */
export function clearPatientDataFor(staffId) {
  try {
    const localDraft = JSON.parse(localStorage.getItem(LOCAL_DRAFT_KEY) || 'null');
    if (localDraft && (!localDraft.savedBy || localDraft.savedBy === staffId)) localStorage.removeItem(LOCAL_DRAFT_KEY);
    localStorage.removeItem(REGISTRATION_DRAFT_PREFIX);
    if (staffId) localStorage.removeItem(registrationDraftKey(staffId));
    const outbox = JSON.parse(localStorage.getItem(SYNC_OUTBOX_KEY) || '[]');
    const remaining = outbox.filter((item) => !ownsItem(item, staffId));
    if (remaining.length) localStorage.setItem(SYNC_OUTBOX_KEY, JSON.stringify(remaining));
    else localStorage.removeItem(SYNC_OUTBOX_KEY);
  } catch {
    // Storage can be unavailable (private mode); nothing was persisted then.
  }
  window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT, { detail: { staffId } }));
}

/** Asks before discarding registrations that have not reached the server. */
export function confirmDiscardUnsynced(pendingCount) {
  if (!pendingCount) return true;
  return window.confirm(`${pendingCount} registration${pendingCount === 1 ? ' has' : 's have'} not reached the server yet. `
    + 'Signing out deletes them from this device. Sign out anyway?');
}
