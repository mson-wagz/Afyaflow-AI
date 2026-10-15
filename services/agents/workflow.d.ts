import { Database } from '../../src/backend/src/database/db.js';
import { Model } from './bedrock.js';
export declare function executeAgent(database: Database, runId: string, model?: Model): Promise<void>;
