#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, handleToolCall } from "./handlers.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
let VERSION = "1.0.0";
try {
  const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
  VERSION = packageJson.version;
} catch {
  // Ignore if package.json not found
}

// Logger function - writes to stderr so it doesn't interfere with MCP stdio
function log(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.error(`[${timestamp}] [claude-mcp-server] [server] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.error(`[${timestamp}] [claude-mcp-server] [server] ${message}`);
  }
}

export function createServer() {
  log(`Creating server v${VERSION}`);

  const server = new Server(
    {
      name: "claude-mcp-server",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log(`ListToolsRequest received`);
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    log(`CallToolRequest received`, { name, args });
    const result = await handleToolCall(name, args as Record<string, unknown>);
    log(`CallToolRequest completed`, { name, hasError: result.isError });
    return result;
  });

  return server;
}

export async function run() {
  log(`Starting claude-mcp-server v${VERSION}`);
  console.error(`claude-mcp-server v${VERSION}`);

  const server = createServer();
  const transport = new StdioServerTransport();

  log(`Connecting to stdio transport`);
  await server.connect(transport);
  log(`Server connected and ready`);
}

// Only run if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  run().catch((error) => {
    console.error("Server failed to start", error);
    process.exit(1);
  });
}
