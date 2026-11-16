/**
 * @file queue.js
 * Browser-safe contracts and sorting algorithms for Hospital Queue Management.
 * 
 * Follows specs/frontend/queue-management/spec.md & specs/features/queue-management/spec.md
 */

import { TRIAGE_PRIORITY, calculateSatsScore } from './triage.js';

/* ------------------------------------------------------------------ */
/* Queue ordering and tie-breaking (queue-order-v2)                    */
/* ------------------------------------------------------------------ */
// Each entry gets one key tuple [level, a, b, visitId], compared component by component.
//   Level 1 (RED, immediate):  a = severity (higher TEWS first; unscored first), b = arrival
//   Levels 2-4 (timed targets): a = arrival (earliest deadline first),           b = severity
//   BLUE and awaiting approval: a = arrival,                                      b = 0
// Every component is a number or a unique string with a fixed placement for missing values,
// and visit IDs are unique, so the comparison is a strict total order: no two entries tie,
// and the result is the same for any input order, device or refresh. See docs/QUEUE_ORDERING.md.

export const QUEUE_ORDERING_VERSION = 'queue-order-v2';
const UNAPPROVED_LEVEL = 6;
const TIMED_LEVELS = new Set([2, 3, 4]);

/** SATS level (1 = Emergency … 5 = Deceased) of the approved priority; awaiting approval is 6. */
export function queueLevel(item) {
  return TRIAGE_PRIORITY[item?.approvedPriority?.code]?.level ?? UNAPPROVED_LEVEL;
}

/**
 * Physiological severity used only to order patients within one approved level: the TEWS of
 * the latest recorded observations, scored exactly as the assessment tool scores it. Null when
 * the protocol cannot score the patient (under 18, age unknown or observations incomplete).
 */
export function queueSeverity(item) {
  if (!Number.isInteger(item?.age) || item.age < 18) return null;
  const result = calculateSatsScore(item.vitals || {});
  return result.isSufficientEvidence ? result.score : null;
}

const arrivalMs = (item) => {
  const ms = new Date(item?.arrivalTime).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY; // unknown arrival goes last in its level
};
// Lower sorts first: unscored (cannot be shown to be less severe) before any score, then higher TEWS.
const severityKey = (severity) => (severity === null ? Number.NEGATIVE_INFINITY : -severity);
const visitId = (item) => String(item?.visitId ?? item?.id ?? '');

/** The full ordering key of one queue entry. */
export function queueOrderKey(item) {
  const level = queueLevel(item), severity = queueSeverity(item), arrival = arrivalMs(item);
  if (level === 1) return [level, severityKey(severity), arrival, visitId(item)];
  if (TIMED_LEVELS.has(level)) return [level, arrival, severityKey(severity), visitId(item)];
  return [level, arrival, 0, visitId(item)];
}

const compareValues = (x, y) => (x < y ? -1 : x > y ? 1 : 0); // numbers, or strings by code unit (locale-independent)

/** Strict total order on queue entries: negative when `a` is seen first. */
export function compareQueueEntries(a, b) {
  const ka = queueOrderKey(a), kb = queueOrderKey(b);
  for (let i = 0; i < ka.length; i += 1) {
    const c = compareValues(ka[i], kb[i]);
    if (c !== 0) return c;
  }
  return 0; // only the same visit
}

const describeSeverity = (s) => (s === null ? 'unscored' : `TEWS ${s}`);

/** Why `item` is ranked directly below `previous` when both share a level; null otherwise. */
function tieBreakReason(previous, item) {
  const level = queueLevel(item);
  if (!previous || queueLevel(previous) !== level || level === UNAPPROVED_LEVEL) return null;
  const sp = queueSeverity(previous), si = queueSeverity(item), ap = arrivalMs(previous), ai = arrivalMs(item);
  const bySeverity = sp !== si
    ? (sp === null ? 'patient above is unscored, so cannot be shown to be less severe' : `lower severity (${describeSeverity(si)} vs ${describeSeverity(sp)})`)
    : null;
  const byArrival = ap !== ai ? 'arrived later' : null;
  const byId = 'same severity and arrival time; ordered by visit ID';
  if (level === 1) return bySeverity || byArrival || byId;
  if (TIMED_LEVELS.has(level)) return byArrival || (bySeverity ? `same arrival time; ${bySeverity}` : byId);
  return byArrival || 'same arrival time; ordered by visit ID';
}

/**
 * Sorts the queue by approved priority with deterministic tie-breaking, and annotates each entry
 * with its `queueOrder` (rank, level, severity) and, when it shares a level with the entry above,
 * the `tieBreak` rule that placed it there.
 *
 * Strict: Pending proposals NEVER alter approved ordering (QUEUE-02); visits awaiting approval
 * keep arrival order below approved patients.
 *
 * @param {Array<object>} queueItems
 * @returns {Array<object>} Sorted queue
 */
export function sortQueueByApprovedPriority(queueItems = []) {
  const sorted = [...queueItems].sort(compareQueueEntries);
  return sorted.map((item, index) => ({
    ...item,
    queueOrder: { rank: index + 1, level: queueLevel(item), severity: queueSeverity(item), version: QUEUE_ORDERING_VERSION },
    tieBreak: tieBreakReason(sorted[index - 1], item),
  }));
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
