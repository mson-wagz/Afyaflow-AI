import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { vitalsSchema } from '../modules/patients/schemas.js';

export const mimicMetadata={
  id:'mimic-iv-ed-demo',name:'MIMIC-IV-ED Demo',version:'2.2',
  sourceUrl:'https://physionet.org/content/mimic-iv-ed-demo/2.2/',
  doi:'https://doi.org/10.13026/jzz5-vs76',
  parentDoi:'https://doi.org/10.13026/5ntk-km72',
  license:'Open Data Commons Open Database License 1.0 (ODbL-1.0)',
  licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',
  citation:'Johnson, A., Bulgarelli, L., Pollard, T., Celi, L. A., Horng, S., & Mark, R. (2023). MIMIC-IV-ED Demo (version 2.2). PhysioNet. RRID:SCR_007345.',
  notice:'Contains information from MIMIC-IV-ED Demo v2.2, available under ODbL 1.0. AfyaFlow adapted research data retains this licence. This applies to the dataset, separately from application code.',
  description:'De-identified historical emergency-department records from Beth Israel Deaconess Medical Center, Boston, USA. The parent database covers 2011–2019. This public demo is a small selected subset, not a representative Kenyan hospital population.',
  limitations:['Research and education only; scoring is not clinically validated.',
    'Age, AVPU and mobility are unavailable in the imported ED tables and are not inferred.',
    'Dates are shifted for de-identification. Triage has no exact measurement timestamp.',
    'Source ESI levels 1–5 are historical labels, not AfyaFlow colour priorities or a validated crosswalk.',
    'Missing or unsupported observations remain missing; raw source values and transformation warnings are retained.',
    'AI review is explicitly requested, uses the configured external provider, and does not train or fine-tune a model.'],
  transformationVersion:'afyaflow-mimic-triage-v1',
};
export const mimicFiles={
  'LICENSE.txt':'bcdfcd4f31c790e30fb645dc36414907172405897adff329ad379eed85d12017',
  'ed/edstays.csv.gz':'fc185cb111a70e9dfd8457c6e1da4f9366dee729e072282995dcd7045a5a3c52',
  'ed/triage.csv.gz':'086dadcb49adc5f24bdda0e342ec9cf0fbcb2e9595516c5c101d408434e1e09b',
};
export type SourceRow=Record<string,string>;
export function transformMimic(stays:SourceRow[],triage:SourceRow[]) {
  const byStay=new Map<string,SourceRow>();
  for(const row of triage) {
    if(!/^\d+$/.test(row.stay_id) || byStay.has(row.stay_id))throw new Error('Invalid or duplicate triage stay identifier.');
    byStay.set(row.stay_id,row);
  }
  const seen=new Set<string>();
  const cases=stays.map(stay=>{
    if(!/^\d+$/.test(stay.stay_id) || !/^\d+$/.test(stay.subject_id) || seen.has(stay.stay_id))throw new Error('Invalid or duplicate ED stay identifier.');
    seen.add(stay.stay_id);
    const row=byStay.get(stay.stay_id);
    if(row && row.subject_id!==stay.subject_id)throw new Error('Mismatched ED stay and triage patient.');
    const warnings:string[]=[];
    const vitals:Record<string,number>={};
    for(const [source,target] of Object.entries({heartrate:'heartRate',sbp:'systolicBp',dbp:'diastolicBp',resprate:'respiratoryRate',o2sat:'spO2',temperature:'temperature'})) {
      const raw=row?.[source]?.trim();
      if(!raw)continue;
      const numeric=Number(raw);
      // The source unit is Fahrenheit. Do not guess that low values are Celsius.
      const value=source==='temperature'?Math.round((numeric-32)*5/9*100)/100:numeric;
      const checked=vitalsSchema.safeParse({[target]:value});
      if(!Number.isFinite(numeric) || !checked.success)warnings.push(`${source}: source value excluded from normalized observations; unsupported value or ambiguous unit.`);
      else vitals[target]=value;
    }
    if(!row)warnings.push('No triage row for this ED stay.');
    const sourceAcuity=row?.acuity?.trim() && Number(row.acuity);
    const acuity=typeof sourceAcuity==='number' && Number.isInteger(sourceAcuity) && sourceAcuity>=1 && sourceAcuity<=5?sourceAcuity:null;
    if(row?.acuity && acuity===null)warnings.push('Source acuity is outside the supported ESI 1–5 labels.');
    return {id:`MIMIC-ED-${createHash('sha256').update(`demo-2.2:${stay.stay_id}`).digest('hex').slice(0,20)}`,name:`Historical case ${stay.stay_id}`,age:null,
      gender:stay.gender==='M'?'Male':stay.gender==='F'?'Female':'Other',
      complaint:row?.chiefcomplaint?.trim() || 'Not recorded in source',vitals,
      sourceData:{dataset:mimicMetadata.id,version:mimicMetadata.version,stayId:stay.stay_id,subjectId:stay.subject_id,
        originalArrival:stay.intime,sourceAcuity:acuity,sourcePain:row?.pain || null,
        timestampBasis:'Source arrival is a shifted reference, not an exact triage observation time. Application timestamps record import time.',
        warnings,transformationVersion:mimicMetadata.transformationVersion,raw:{edstay:stay,triage:row || null}}};
  });
  if([...byStay.keys()].some(key=>!seen.has(key)))throw new Error('Triage row has no matching ED stay.');
  return cases;
}
export async function loadMimicDemo(directory='data/mimic-iv-ed-demo-2.2') {
  const contents:Record<string,Buffer>={};
  for(const [name,checksum] of Object.entries(mimicFiles)) {
    const bytes=await readFile(`${directory}/${name}`);
    if(createHash('sha256').update(bytes).digest('hex')!==checksum)throw new Error(`MIMIC demo checksum mismatch: ${name}`);
    contents[name]=bytes;
  }
  const csv=(name:string):SourceRow[]=>parse(gunzipSync(contents[name]),{columns:true,bom:true,skip_empty_lines:true});
  const cases=transformMimic(csv('ed/edstays.csv.gz'),csv('ed/triage.csv.gz'));
  if(!cases.length)throw new Error('MIMIC demo contains no ED stays.');
  return cases;
}
