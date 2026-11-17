/**
 * @file danger-signs.js
 * Possible emergency signs the triage agent may point out in a patient's written complaint.
 *
 * DRAFT for review by the KNH triage committee. This is NOT the SATS discriminator list and it
 * never changes a priority: a flagged sign asks the nurse to confirm it with the patient and,
 * if present, to override the priority with a reason.
 *
 * Each flag must quote the complaint's own words; a sign outside this list, or a quote that is
 * not in the complaint, is rejected, so the model cannot invent findings.
 */
export const DANGER_SIGNS = {
  chest_pain: 'Chest pain',
  difficulty_breathing: 'Difficulty breathing',
  seizure: 'Seizure or fitting',
  reduced_consciousness: 'Reduced consciousness or collapse',
  heavy_bleeding: 'Heavy bleeding',
  severe_burn: 'Severe burn',
  poisoning_overdose: 'Poisoning or overdose',
  pregnancy_bleeding_or_pain: 'Pregnancy with bleeding or abdominal pain',
  severe_pain: 'Severe pain',
};

const normalise = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Keeps only flags whose sign is on the list and whose quote appears, word for word, in the
 * complaint (case and spacing ignored). Duplicate signs are kept once.
 * @returns {{ accepted: {sign:string,label:string,quote:string}[], rejected: {sign:unknown,quote:unknown,reason:string}[] }}
 */
export function validateDangerSigns(flags, complaint) {
  const text = normalise(complaint);
  const accepted = [], rejected = [], seen = new Set();
  for (const flag of Array.isArray(flags) ? flags : []) {
    const sign = flag?.sign, quote = normalise(flag?.quote);
    if (!Object.hasOwn(DANGER_SIGNS, sign)) rejected.push({ sign, quote: flag?.quote, reason: 'Not on the approved list' });
    else if (quote.length < 3 || quote.length > 160) rejected.push({ sign, quote: flag?.quote, reason: 'Quote missing or too long' });
    else if (!text.includes(quote)) rejected.push({ sign, quote: flag?.quote, reason: 'Quote not found in the complaint' });
    else if (!seen.has(sign)) { seen.add(sign); accepted.push({ sign, label: DANGER_SIGNS[sign], quote: flag.quote.trim() }); }
  }
  return { accepted, rejected };
}
