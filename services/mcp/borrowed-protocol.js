import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
import { protocolPath } from './tools.js';
export async function readProtocolThroughFilesystem() {
    const client = new Client({ name: 'afyaflow-protocol-reader', version: '0.1.0' });
    const transport = new StdioClientTransport({ command: process.execPath,
        args: [resolve('node_modules/@modelcontextprotocol/server-filesystem/dist/index.js'), resolve('services/mcp/protocols')], stderr: 'pipe' });
    try {
        await client.connect(transport);
        const result = await client.callTool({ name: 'read_text_file', arguments: { path: resolve(protocolPath) } }, { timeout: 15000 });
        if (result.isError)
            throw new Error('Protocol filesystem retrieval failed.');
        const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        return JSON.parse(text);
    }
    finally {
        await client.close();
    }
}
//# sourceMappingURL=borrowed-protocol.js.map