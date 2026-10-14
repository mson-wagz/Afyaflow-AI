/**
 * @file apiAdapter.js
 * Hospital queue and workload query adapter.
 * Handles approved priorities, elapsed wait times, and polling failure simulation.
 */

import { sortQueueByApprovedPriority, calculateWorkloadSnapshot } from '../../../../shared/contracts/queue.js';

import { readDemoState, isDemoOnline } from '../../demo/store.js';
import { calculateSatsScore } from '../../../../shared/contracts/triage.js';

/**
 * Retrieves the hospital queue with approved ordering.
 * Strict: Visits awaiting agent results remain visible (QUEUE-01).
 * Pending proposals do NOT reorder approved entries (QUEUE-02).
 *
 * @param {boolean} simulateFailure If true, throws network error to test stale snapshot handling
 * @returns {Promise<{ queue: object[], snapshotTimestamp: string, workload: object }>}
 */
export async function apiFetchQueueData(simulateFailure = false) {
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (simulateFailure || !isDemoOnline()) {
    throw new Error('Network timeout: Facility API unreachable (simulated polling failure)');
  }

  const sortedQueue = sortQueueByApprovedPriority(readDemoState().visits.map(v => ({...v,
    pendingProposal: v.needsReview ? {priority:calculateSatsScore(v.vitals || {}).priority} : null
  })));
  const workload = calculateWorkloadSnapshot(sortedQueue, 4);

  return {
    queue: sortedQueue,
    snapshotTimestamp: new Date().toISOString(),
    workload,
  };
}
