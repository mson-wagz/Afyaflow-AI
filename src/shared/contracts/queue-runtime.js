/**
 * @file queue.js
 * Browser-safe contracts and sorting algorithms for Hospital Queue Management.
 * 
 * Follows specs/frontend/queue-management/spec.md & specs/features/queue-management/spec.md
 */

import { TRIAGE_PRIORITY, calculateSatsScore, ADULT_CHART_MIN_AGE } from './triage.js';

/* ------------------------------------------------------------------ */
/* Queue ordering and tie-breaking (queue-order-v3)                    */
/* ------------------------------------------------------------------ */
// Each entry gets one key tuple, compared component by component:
//   [level, a, b, precedence, registration, visitId]
//   Level 1 (RED, immediate):  a = severity (higher TEWS first; unscored first), b = arrival minute
//   Levels 2-4 (timed targets): a = arrival minute (earliest deadline first),     b = severity
//   BLUE and awaiting approval: a = arrival minute,                               b = 0
// Entries equal on [level, a, b] are CLINICALLY TIED. Among them, a current clinician "see first"
// decision (most recent first) comes before none; then the server registration sequence (first
// registered first); the unique visit ID is only a guard. Every component is a number or a
// unique string with a fixed placement for missing values, so the comparison is a strict total
// order: the result is the same for any input order, device or refresh. See docs/QUEUE_ORDERING.md.

export const QUEUE_ORDERING_VERSION = 'queue-order-v3';
const UNAPPROVED_LEVEL = 6;
const TIMED_LEVELS = new Set([2, 3, 4]);
const MINUTE = 60000;

/** SATS level (1 = Emergency … 5 = Deceased) of the approved priority; awaiting approval is 6. */
export function queueLevel(item) {
  return TRIAGE_PRIORITY[item?.approvedPriority?.code]?.level ?? UNAPPROVED_LEVEL;
}

/**
 * Physiological severity used only to order patients within one approved level: the TEWS of
 * the latest recorded observations, scored exactly as the assessment tool scores it. Null when
 * the protocol cannot score the patient (under 13, age unknown or observations incomplete).
 */
export function queueSeverity(item) {
  if (!Number.isInteger(item?.age) || item.age < ADULT_CHART_MIN_AGE) return null;
  const result = calculateSatsScore(item.vitals || {});
  return result.isSufficientEvidence ? result.score : null;
}

// Arrival times are recorded to the minute, so arrivals within the same minute are simultaneous.
const arrivalMinute = (item) => {
  const ms = new Date(item?.arrivalTime).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / MINUTE) : Number.POSITIVE_INFINITY; // unknown goes last in its level
};
// Lower sorts first: unscored (cannot be shown to be less severe) before any score, then higher TEWS.
const severityKey = (severity) => (severity === null ? Number.NEGATIVE_INFINITY : -severity);
// A current clinician decision sorts first, the most recent first; no decision sorts last.
const precedenceKey = (item) => {
  const ms = new Date(item?.queuePrecedence?.at).getTime();
  return item?.queuePrecedence && Number.isFinite(ms) ? -ms : Number.POSITIVE_INFINITY;
};
const registrationKey = (item) => {
  const n = Number(item?.registrationSeq);
  return item?.registrationSeq !== undefined && item?.registrationSeq !== null && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};
const visitId = (item) => String(item?.visitId ?? item?.id ?? '');

/** The full ordering key of one queue entry. */
export function queueOrderKey(item) {
  const level = queueLevel(item), severity = severityKey(queueSeverity(item)), arrival = arrivalMinute(item);
  const [a, b] = level === 1 ? [severity, arrival] : TIMED_LEVELS.has(level) ? [arrival, severity] : [arrival, 0];
  const precedence = level <= 4 ? precedenceKey(item) : Number.POSITIVE_INFINITY;
  return [level, a, b, precedence, registrationKey(item), visitId(item)];
}

const compareValues = (x, y) => (x < y ? -1 : x > y ? 1 : 0); // numbers, or strings by code unit (locale-independent)
const compareKeys = (ka, kb, length = ka.length) => {
  for (let i = 0; i < length; i += 1) {
    const c = compareValues(ka[i], kb[i]);
    if (c !== 0) return c;
  }
  return 0;
};

/** Strict total order on queue entries: negative when `a` is seen first. */
export function compareQueueEntries(a, b) {
  return compareKeys(queueOrderKey(a), queueOrderKey(b));
}

/** True when two approved entries are equal on every clinical criterion (level, severity, arrival minute). */
export function areClinicallyTied(a, b) {
  return queueLevel(a) <= 4 && compareKeys(queueOrderKey(a), queueOrderKey(b), 3) === 0;
}

const describeSeverity = (s) => (s === null ? 'unscored' : `TEWS ${s}`);

/** Why `item` is ranked directly below `previous` when both share a level; null otherwise. */
function tieBreakReason(previous, item) {
  const level = queueLevel(item);
  if (!previous || queueLevel(previous) !== level || level === UNAPPROVED_LEVEL) return null;
  if (areClinicallyTied(previous, item)) {
    if (previous.queuePrecedence && precedenceKey(previous) !== precedenceKey(item))
      return item.queuePrecedence
        ? 'clinically tied; a clinician more recently chose the patient above to be seen first'
        : 'clinically tied; a clinician chose the patient above to be seen first';
    return registrationKey(previous) !== registrationKey(item)
      ? 'clinically tied; registered later'
      : 'clinically tied; ordered by visit ID';
  }
  const sp = queueSeverity(previous), si = queueSeverity(item);
  const bySeverity = sp !== si
    ? (sp === null ? 'patient above is unscored, so cannot be shown to be less severe' : `lower severity (${describeSeverity(si)} vs ${describeSeverity(sp)})`)
    : null;
  const byArrival = arrivalMinute(previous) !== arrivalMinute(item) ? 'arrived later' : null;
  if (level === 1) return bySeverity || byArrival;
  if (TIMED_LEVELS.has(level)) return byArrival || `same arrival time; ${bySeverity}`;
  return byArrival || 'same arrival time; registered later';
}

/**
 * Sorts the queue by approved priority with deterministic tie-breaking, and annotates each entry
 * with its `queueOrder` (rank, level, severity), the `tieBreak` rule that placed it below the
 * entry above on the same level, and `clinicalTie` ({ size, position }) when it is equal to
 * other approved patients on every clinical criterion.
 *
 * Strict: Pending proposals NEVER alter approved ordering (QUEUE-02); visits awaiting approval
 * keep arrival order below approved patients.
 *
 * @param {Array<object>} queueItems
 * @returns {Array<object>} Sorted queue
 */
export function sortQueueByApprovedPriority(queueItems = []) {
  const sorted = [...queueItems].sort(compareQueueEntries);
  // Tied entries are contiguous after sorting: group consecutive runs.
  const groups = [];
  sorted.forEach((item, i) => {
    if (i > 0 && areClinicallyTied(sorted[i - 1], item)) groups[groups.length - 1].push(i);
    else groups.push([i]);
  });
  const tie = new Map();
  for (const group of groups) {
    if (group.length > 1) group.forEach((index, position) => tie.set(index, { size: group.length, position: position + 1 }));
  }
  return sorted.map((item, index) => ({
    ...item,
    queueOrder: { rank: index + 1, level: queueLevel(item), severity: queueSeverity(item), version: QUEUE_ORDERING_VERSION },
    tieBreak: tieBreakReason(sorted[index - 1], item),
    clinicalTie: tie.get(index) || null,
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
