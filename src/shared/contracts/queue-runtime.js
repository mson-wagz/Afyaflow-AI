/**
 * @file queue.js
 * Browser-safe contracts and sorting algorithms for Hospital Queue Management.
 * 
 * Follows specs/frontend/queue-management/spec.md & specs/features/queue-management/spec.md
 */

import { TRIAGE_PRIORITY } from './triage.js';

const PRIORITY_ORDER = {
  RED: 1,
  ORANGE: 2,
  YELLOW: 3,
  GREEN: 4,
  BLUE: 5,
};

/**
 * Sorts queue entries by:
 * 1. Approved priority (Red > Orange > Yellow > Green)
 * 2. Unapproved / awaiting triage visits maintain arrival order without leaping approved patients
 * 3. Tie-breaking by arrival time (earliest arrival first)
 * 
 * Strict: Pending proposals NEVER alter approved ordering (QUEUE-02).
 * 
 * @param {Array<object>} queueItems
 * @returns {Array<object>} Sorted queue
 */
export function sortQueueByApprovedPriority(queueItems = []) {
  return [...queueItems].sort((a, b) => {
    // Only compare approved priorities
    const prioA = a.approvedPriority ? PRIORITY_ORDER[a.approvedPriority.code] || 99 : 99;
    const prioB = b.approvedPriority ? PRIORITY_ORDER[b.approvedPriority.code] || 99 : 99;

    if (prioA !== prioB) {
      return prioA - prioB;
    }

    // Tie breaker: earliest arrival time
    const timeA = new Date(a.arrivalTime).getTime();
    const timeB = new Date(b.arrivalTime).getTime();
    return timeA - timeB;
  });
}

/**
 * Calculates elapsed waiting time string from arrival timestamp
 * @param {string} arrivalIsoTimestamp
 * @returns {string} e.g. "18 mins" or "1h 12m"
 */
export function calculateElapsedWaitingTime(arrivalIsoTimestamp) {
  if (!arrivalIsoTimestamp) return '0 mins';
  const arrival = new Date(arrivalIsoTimestamp).getTime();
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.floor((now - arrival) / (60 * 1000)));

  if (diffMinutes < 60) {
    return `${diffMinutes} mins`;
  }
  const hours = Math.floor(diffMinutes / 60);
  const remainingMins = diffMinutes % 60;
  return `${hours}h ${remainingMins}m`;
}

/**
 * Calculates current department workload and nurse-to-patient ratio
 * @param {Array<object>} queueItems
 * @param {number} availableNurses
 * @returns {object} Workload snapshot
 */
export function calculateWorkloadSnapshot(queueItems = [], availableNurses = 4) {
  const totalWaiting = queueItems.length;
  const redCount = queueItems.filter((q) => q.approvedPriority?.code === 'RED').length;
  const orangeCount = queueItems.filter((q) => q.approvedPriority?.code === 'ORANGE').length;
  const pendingTriageCount = queueItems.filter((q) => !q.approvedPriority).length;

  const ratio = availableNurses > 0 ? (totalWaiting / availableNurses).toFixed(1) : totalWaiting;
  const isHighLoad = ratio > 6 || redCount > 0 || orangeCount >= 3;

  return {
    totalWaiting,
    redCount,
    orangeCount,
    pendingTriageCount,
    availableNurses,
    ratio: `${ratio}:1`,
    isHighLoad,
    recommendation: isHighLoad
      ? 'High triage load: Reassign 1 relief nurse to Station 1'
      : 'Workload within normal operational parameters',
  };
}
