import { executeClaude, executeClaudeReply, type ClaudeOptions } from "./claude-service.js";

// Logger function - writes to stderr so it doesn't interfere with MCP stdio
function log(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.error(`[${timestamp}] [claude-mcp-server] [handlers] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.error(`[${timestamp}] [claude-mcp-server] [handlers] ${message}`);
  }
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  _meta?: { sessionId: string };
  [key: string]: unknown;
}

export const TOOLS = [
  {
    name: "chat",
    description: "Start a new Claude session with a prompt. Returns the response and the new Session ID.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The prompt to start the session with."
        },
        model: {
          type: "string",
          description: "Optional: The model to use (e.g., 'sonnet', 'opus', 'haiku')."
        },
        systemPrompt: {
          type: "string",
          description: "Optional: System prompt to set the assistant's behavior."
        },
        cwd: {
          type: "string",
          description: "Optional: Working directory for the claude CLI execution."
        }
      },
      required: ["prompt"],
    },
  },
  {
    name: "chat-reply",
    description: "Continue an existing Claude session.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The prompt to continue the conversation."
        },
        sessionId: {
          type: "string",
          description: "The session ID to continue. If not provided, continues the most recent session."
        },
        model: {
          type: "string",
          description: "Optional: The model to use for this turn."
        },
        systemPrompt: {
          type: "string",
          description: "Optional: Additional system prompt to append for this turn."
        },
        cwd: {
          type: "string",
          description: "Optional: Working directory for the claude CLI execution."
        }
      },
      required: ["prompt"],
    },
  },
];

export interface ClaudeArgs {
  prompt: string;
  model?: string;
  systemPrompt?: string;
  cwd?: string;
}

export interface ClaudeReplyArgs {
  prompt: string;
  sessionId?: string;
  model?: string;
  systemPrompt?: string;
  cwd?: string;
}

export async function handleClaude(args: ClaudeArgs): Promise<ToolResult> {
  log(`handleClaude called`, args);

  const { prompt, model, systemPrompt, cwd } = args;
  const options: ClaudeOptions = { model, systemPrompt, cwd };

  const { response, sessionId } = await executeClaude(prompt, options);

  log(`handleClaude returning`, { sessionId, responseLength: response.length });

  return {
    content: [
      {
        type: "text",
        text: response
      }
    ],
    ...(sessionId && { _meta: { sessionId } })
  };
}

export async function handleClaudeReply(args: ClaudeReplyArgs): Promise<ToolResult> {
  log(`handleClaudeReply called`, args);

  const { prompt, sessionId, model, systemPrompt, cwd } = args;
  const options: ClaudeOptions = { model, systemPrompt, cwd };

  const { response, sessionId: newSessionId } = await executeClaudeReply(prompt, sessionId, options);

  log(`handleClaudeReply returning`, { sessionId: newSessionId, responseLength: response.length });

  return {
    content: [
      {
        type: "text",
        text: response
      }
    ],
    ...(newSessionId && { _meta: { sessionId: newSessionId } })
  };
}

export async function handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  log(`handleToolCall: ${name}`, args);

  try {
    if (name === "chat") {
      return await handleClaude(args as unknown as ClaudeArgs);
    }

    if (name === "chat-reply") {
      return await handleClaudeReply(args as unknown as ClaudeReplyArgs);
    }
  } catch (error: any) {
    log(`handleToolCall error`, { name, error: error.message, stack: error.stack });
    return {
      content: [{ type: "text", text: `Error executing claude: ${error.message}` }],
      isError: true,
    };
  }

  log(`Unknown tool: ${name}`);
  throw new Error(`Unknown tool: ${name}`);
}
