/**
 * @file offline.js
 * Browser-safe contracts and state transitions for Offline PWA Draft Management and Server Sync.
 * 
 * Follows specs/frontend/offline-pwa/spec.md
 */

export const SYNC_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_SYNC: 'PENDING_SYNC',
  CONFIRMED: 'CONFIRMED',
  FAILED_SYNC: 'FAILED_SYNC',
};

export const SYNC_ITEM_TYPES = {
  REGISTRATION_DRAFT: 'REGISTRATION_DRAFT',
  OBSERVATION_ENTRY: 'OBSERVATION_ENTRY',
  CLINICAL_DECISION: 'CLINICAL_DECISION',
};

/**
 * Validates whether an action is eligible for offline deferred synchronization.
 * Policy: Clinical approvals and queue mutations REQUIRE online server acknowledgement.
 * Local patient drafts may be queued offline.
 * 
 * @param {string} itemType
 * @param {boolean} isOnline
 * @returns {{ allowedOffline: boolean, reason?: string }}
 */
export function checkOfflineActionPolicy(itemType, isOnline) {
  if (isOnline) {
    return { allowedOffline: true };
  }

  if (itemType === SYNC_ITEM_TYPES.CLINICAL_DECISION) {
    return {
      allowedOffline: false,
      reason: 'Clinical triage approval requires active online connectivity for immediate server acknowledgement.',
    };
  }

  return {
    allowedOffline: true,
  };
}
