import { McpServer } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { Database } from '../../src/backend/src/database/db.js';
export declare const protocolPath = "services/mcp/protocols/synthetic-adult-v1.json";
export declare function readProtocol(): Promise<any>;
export declare function scoreEvidence(evidence: any, protocol: any): any;
export declare function createRunTools(database: Database, runId: string): Promise<{
    server: McpServer;
    client: Client;
    attempt: any;
    generation: any;
    isSaved: () => boolean;
    isSufficient: () => boolean;
    close: () => Promise<void>;
}>;
