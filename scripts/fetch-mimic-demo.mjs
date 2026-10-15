// Public demo only. Never substitute credentialed MIMIC-IV-ED files.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base='https://physionet.org/files/mimic-iv-ed-demo/2.2/';
const files={
  'LICENSE.txt':'bcdfcd4f31c790e30fb645dc36414907172405897adff329ad379eed85d12017',
  'ed/edstays.csv.gz':'fc185cb111a70e9dfd8457c6e1da4f9366dee729e072282995dcd7045a5a3c52',
  'ed/triage.csv.gz':'086dadcb49adc5f24bdda0e342ec9cf0fbcb2e9595516c5c101d408434e1e09b',
};
for(const [name,sha256] of Object.entries(files)) {
  const response=await fetch(base+name,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Download failed: ${name} (${response.status})`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw new Error(`Checksum mismatch: ${name}`);
  const target=`data/mimic-iv-ed-demo-2.2/${name}`;
  await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});
  await writeFile(target,bytes);
  console.log(`Verified ${name}`);
}
