import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { Database } from '../../src/backend/src/database/db.js';
import { createRunTools } from './tools.js';
const runId=process.env.AFYAFLOW_AGENT_RUN_ID;
if (!runId) throw new Error('AFYAFLOW_AGENT_RUN_ID is required; tools are bound to an active run.');
const database=new Database();
const tools=await createRunTools(database,runId);
// Close the in-process transport before exposing the same run-scoped tools via stdio.
await tools.client.close();
await tools.server.connect(new StdioServerTransport());
process.on('SIGTERM',async () => {await tools.close();await database.onModuleDestroy();});
