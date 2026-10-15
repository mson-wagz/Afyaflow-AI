import { randomUUID } from 'node:crypto';
import { Database, audit, id } from './db.js';
import { pinHash } from '../auth/auth.js';
import { loadMimicDemo, mimicMetadata } from './mimic-data.js';

export async function importMimicDemo(database:Database) {
  const cases=await loadMimicDemo();
  return database.transaction(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(741094)');
    const actor='SYSTEM-MIMIC-IMPORT';
    await db.query(`INSERT INTO staff(id,staff_number,role,pin_hash,profile) VALUES($1,$1,'admin',$2,$3) ON CONFLICT DO NOTHING`,
      [actor,pinHash(randomUUID()),JSON.stringify({name:'MIMIC dataset importer',systemAccount:true})]);
    let inserted=0;
    for(const record of cases) {
      const result=await db.query(`INSERT INTO visits(id,name,age,gender,complaint,registered_by,data_source,source_data,assigned_department,assessment_status)
        VALUES($1,$2,null,$3,$4,$5,'mimic-iv-ed-demo',$6,'Historical research library','RESEARCH_NOT_ASSESSED')
        ON CONFLICT(id) DO NOTHING RETURNING id`,[record.id,record.name,record.gender,record.complaint,actor,JSON.stringify(record.sourceData)]);
      if(!result.rowCount)continue;
      await db.query('INSERT INTO observations(id,visit_id,version,vitals,recorded_by) VALUES($1,$2,1,$3,$4)',[id('OBS'),record.id,JSON.stringify(record.vitals),actor]);
      inserted++;
    }
    if(inserted)await audit(db,actor,'HISTORICAL_DATASET_IMPORTED',{dataset:mimicMetadata.id,version:mimicMetadata.version,inserted,total:cases.length});
    return {dataset:mimicMetadata.id,inserted,total:cases.length,subjects:new Set(cases.map(record=>record.sourceData.subjectId)).size};
  });
}
if(process.argv[1]?.endsWith('import-mimic.ts') || process.argv[1]?.endsWith('import-mimic.js')) {
  const database=new Database();
  try {console.log(JSON.stringify(await importMimicDemo(database)));} finally {await database.onModuleDestroy();}
}
