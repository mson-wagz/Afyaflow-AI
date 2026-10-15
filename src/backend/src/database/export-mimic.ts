import { loadMimicDemo, mimicMetadata } from './mimic-data.js';
import { config } from '../config.js';
if(config.mode==='competition')throw new Error('Historical data export is disabled in competition mode.');
const cases=await loadMimicDemo();
process.stdout.write(JSON.stringify({metadata:mimicMetadata,cases:cases.map(record=>({id:record.id,
  age:record.age,gender:record.gender,presentingComplaint:record.complaint,vitals:record.vitals,source:record.sourceData}))},null,2)+'\n');
