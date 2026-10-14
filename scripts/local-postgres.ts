import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const url = new URL(process.env.DATABASE_URL || '');
if (!['127.0.0.1','localhost'].includes(url.hostname)) throw new Error('Local database helper requires a loopback DATABASE_URL.');
const databaseDir = resolve('.local/postgres');
const pg = new EmbeddedPostgres({databaseDir, user:url.username,password:decodeURIComponent(url.password),
  port:Number(url.port || 5432),persistent:true,authMethod:'scram-sha-256',
  postgresFlags:['-c','listen_addresses=127.0.0.1'],onLog:msg => console.log(String(msg)),onError:console.error});
if (!existsSync(resolve(databaseDir,'PG_VERSION'))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const database = url.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*$/.test(database)) throw new Error('Use a simple database name.');
if (!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)
  await pg.createDatabase(database);
await client.end();
console.log(`PostgreSQL ready on 127.0.0.1:${url.port || 5432}; database ${database}`);
const keepAlive = setInterval(() => {},60000);
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,async () => {
  clearInterval(keepAlive);await pg.stop();process.exit(0);
});
