import { describe, it, expect } from 'vitest';
import { sortQueueByApprovedPriority, compareQueueEntries, queueSeverity } from '../../../../shared/contracts/queue.js';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

// Vitals with a known TEWS under the shared scorer (HR, SBP, RR, temperature, AVPU).
const VITALS = {
  tews0: { heartRate: 80, systolicBp: 120, respiratoryRate: 16, temperature: 37, avpu: 'Alert' },
  tews7: { heartRate: 135, systolicBp: 75, respiratoryRate: 25, temperature: 38.6, avpu: 'Alert' }, // 3+2+1+1
  tews9: { heartRate: 135, systolicBp: 75, respiratoryRate: 32, temperature: 37, avpu: 'Voice' },   // 3+2+2+0+2
};
const T0 = Date.parse('2026-11-16T08:00:00.000Z');
const at = (minutes) => new Date(T0 + minutes * 60000).toISOString();
const patient = (id, code, { minutes = 0, vitals = VITALS.tews0, age = 40, seq, precedenceAt } = {}) => ({
  id, visitId: id, name: id, age, vitals, arrivalTime: at(minutes), approvedPriority: code ? TRIAGE_PRIORITY[code] : null,
  ...(seq !== undefined ? { registrationSeq: seq } : {}),
  ...(precedenceAt !== undefined ? { queuePrecedence: { at: at(precedenceAt), byName: 'Dr. Synthetic', reason: 'Synthetic reason' } } : {}),
});
const ids = (queue) => queue.map((p) => p.id);

describe('queue tie-breaking (queue-order-v3)', () => {
  it('uses the shared scorer for severity and refuses to score children or incomplete observations', () => {
    expect(queueSeverity(patient('a', 'RED', { vitals: VITALS.tews7 }))).toBe(7);
    expect(queueSeverity(patient('b', 'RED', { vitals: VITALS.tews9 }))).toBe(9);
    expect(queueSeverity(patient('c', 'RED', { vitals: VITALS.tews9, age: 12 }))).toBeNull();
    expect(queueSeverity(patient('c13', 'RED', { vitals: VITALS.tews9, age: 13 }))).toBe(9); // KNH adult A&E starts at 13
    expect(queueSeverity(patient('d', 'RED', { vitals: { heartRate: 140 } }))).toBeNull();
  });

  it('orders Level 1 (RED) patients by severity, then arrival, then visit ID', () => {
    const queue = sortQueueByApprovedPriority([
      patient('SYN-1', 'RED', { minutes: 0, vitals: VITALS.tews7 }),
      patient('SYN-2', 'RED', { minutes: 5, vitals: VITALS.tews9 }),
      patient('SYN-4', 'RED', { minutes: 2, vitals: VITALS.tews7 }),
      patient('SYN-3', 'RED', { minutes: 2, vitals: VITALS.tews7 }),
    ]);
    // Sickest first even though they arrived last; equal TEWS by arrival; equal arrival by visit ID.
    expect(ids(queue)).toEqual(['SYN-2', 'SYN-1', 'SYN-3', 'SYN-4']);
    expect(queue[1].tieBreak).toBe('lower severity (TEWS 7 vs TEWS 9)');
    expect(queue[2].tieBreak).toBe('arrived later');
    expect(queue[3].tieBreak).toBe('clinically tied; ordered by visit ID');
    expect(queue[0].queueOrder).toEqual({ rank: 1, level: 1, severity: 9, version: 'queue-order-v3' });
  });

  it('puts unscored Level 1 patients first, because they cannot be shown to be less severe', () => {
    const queue = sortQueueByApprovedPriority([
      patient('SYN-A', 'RED', { vitals: VITALS.tews9 }),
      patient('SYN-B', 'RED', { minutes: 9, vitals: VITALS.tews9, age: 9 }),
    ]);
    expect(ids(queue)).toEqual(['SYN-B', 'SYN-A']);
    expect(queue[1].tieBreak).toMatch(/unscored/);
  });

  it('orders timed levels (2-4) earliest deadline first, with severity only for the same arrival', () => {
    const queue = sortQueueByApprovedPriority([
      patient('SYN-5', 'ORANGE', { minutes: 3, vitals: VITALS.tews9 }),
      patient('SYN-6', 'ORANGE', { minutes: 0, vitals: VITALS.tews0 }),
      patient('SYN-7', 'ORANGE', { minutes: 3, vitals: VITALS.tews7 }),
    ]);
    expect(ids(queue)).toEqual(['SYN-6', 'SYN-5', 'SYN-7']);
    expect(queue[2].tieBreak).toBe('same arrival time; lower severity (TEWS 7 vs TEWS 9)');
  });

  it('never lets the tie-break move a patient across levels or ahead of approved patients', () => {
    const queue = sortQueueByApprovedPriority([
      patient('W', null, { minutes: -60, vitals: VITALS.tews9 }),
      patient('G', 'GREEN', { minutes: -50, vitals: VITALS.tews9 }),
      patient('Y', 'YELLOW', { minutes: 30 }),
      patient('R', 'RED', { minutes: 40 }),
      patient('O', 'ORANGE', { minutes: 20 }),
      patient('W2', null, { minutes: -90 }),
    ]);
    expect(ids(queue)).toEqual(['R', 'O', 'Y', 'G', 'W2', 'W']);
    expect(queue.map((p) => p.queueOrder.level)).toEqual([1, 2, 3, 4, 6, 6]);
    expect(queue.slice(0, 5).every((p) => p.tieBreak === null)).toBe(true);
  });

  it('places an unknown arrival time last within its level instead of breaking the sort', () => {
    const bad = { ...patient('SYN-X', 'YELLOW'), arrivalTime: 'not-a-date' };
    expect(ids(sortQueueByApprovedPriority([bad, patient('SYN-Y', 'YELLOW', { minutes: 500 })]))).toEqual(['SYN-Y', 'SYN-X']);
  });

  describe('full clinical ties (same level, same vitals, same arrival)', () => {
    const tied = (id, extra) => patient(id, 'RED', { vitals: VITALS.tews9, ...extra });

    it('treats arrivals within the same minute as simultaneous', () => {
      const early = { ...tied('SYN-Z', { seq: 2 }), arrivalTime: '2026-11-16T08:00:05.000Z' };
      const late = { ...tied('SYN-A', { seq: 1 }), arrivalTime: '2026-11-16T08:00:55.000Z' };
      // Seconds within the minute do not decide; registration order does.
      expect(ids(sortQueueByApprovedPriority([early, late]))).toEqual(['SYN-A', 'SYN-Z']);
    });

    it('orders a full tie by who was registered first, not by the random visit ID', () => {
      const queue = sortQueueByApprovedPriority([tied('SYN-a', { seq: 30 }), tied('SYN-z', { seq: 10 }), tied('SYN-m', { seq: 20 })]);
      expect(ids(queue)).toEqual(['SYN-z', 'SYN-m', 'SYN-a']);
      expect(queue.map((p) => p.clinicalTie)).toEqual([{ size: 3, position: 1 }, { size: 3, position: 2 }, { size: 3, position: 3 }]);
      expect(queue[1].tieBreak).toBe('clinically tied; registered later');
    });

    it('lets a clinician choose who is seen first, with the most recent choice winning', () => {
      const queue = sortQueueByApprovedPriority([
        tied('SYN-1', { seq: 1 }), tied('SYN-2', { seq: 2, precedenceAt: 5 }), tied('SYN-3', { seq: 3, precedenceAt: 9 }),
      ]);
      expect(ids(queue)).toEqual(['SYN-3', 'SYN-2', 'SYN-1']);
      expect(queue[1].tieBreak).toBe('clinically tied; a clinician more recently chose the patient above to be seen first');
      expect(queue[2].tieBreak).toBe('clinically tied; a clinician chose the patient above to be seen first');
    });

    it('never lets a clinician choice jump a patient who is not tied with it', () => {
      const queue = sortQueueByApprovedPriority([
        patient('SICKER', 'RED', { vitals: VITALS.tews9, seq: 9 }),
        patient('CHOSEN', 'RED', { vitals: VITALS.tews7, seq: 1, precedenceAt: 1 }),
        patient('EARLIER', 'ORANGE', { minutes: -30, seq: 2 }),
        patient('CHOSEN-O', 'ORANGE', { minutes: 0, seq: 3, precedenceAt: 2 }),
      ]);
      expect(ids(queue)).toEqual(['SICKER', 'CHOSEN', 'EARLIER', 'CHOSEN-O']);
      expect(queue.every((p) => p.clinicalTie === null)).toBe(true);
    });

    it('does not mark patients awaiting approval as clinically tied', () => {
      const queue = sortQueueByApprovedPriority([patient('W1', null, { seq: 1 }), patient('W2', null, { seq: 2 })]);
      expect(queue.map((p) => p.clinicalTie)).toEqual([null, null]);
    });
  });

  describe('strict total order (no deadlocks)', () => {
    // A deterministic pseudo-random population with many deliberate ties in level, severity and arrival.
    let seed = 20261116;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const population = Array.from({ length: 40 }, (_, i) => patient(`SYN-${String(i).padStart(3, '0')}`,
      pick(['RED', 'RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', null]),
      { minutes: pick([0, 0, 5, 10]), vitals: pick([VITALS.tews0, VITALS.tews7, VITALS.tews9, {}]), age: pick([40, 40, 12]),
        seq: pick([i, i, undefined]), precedenceAt: pick([undefined, undefined, 1, 2]) }));
    const shuffle = (list) => { const copy = [...list]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };

    it('gives the same order for every input order', () => {
      const expected = ids(sortQueueByApprovedPriority(population));
      for (let run = 0; run < 200; run += 1) expect(ids(sortQueueByApprovedPriority(shuffle(population)))).toEqual(expected);
    });

    it('never ranks two different patients as equal, and is antisymmetric and transitive', () => {
      for (const a of population) {
        for (const b of population) {
          const ab = Math.sign(compareQueueEntries(a, b)), ba = Math.sign(compareQueueEntries(b, a));
          if (a === b) expect(ab).toBe(0);
          else { expect(ab).not.toBe(0); expect(ab).toBe(-ba); }
          for (const c of population) {
            if (compareQueueEntries(a, b) < 0 && compareQueueEntries(b, c) < 0) expect(compareQueueEntries(a, c)).toBeLessThan(0);
          }
        }
      }
    });
  });
});
