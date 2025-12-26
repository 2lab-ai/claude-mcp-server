import { exec } from "child_process";
import { promisify } from "util";

const execAsyncRaw = promisify(exec);

// Logger function - writes to stderr so it doesn't interfere with MCP stdio
function log(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.error(`[${timestamp}] [claude-mcp-server] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.error(`[${timestamp}] [claude-mcp-server] ${message}`);
  }
}

export interface ClaudeResponse {
  response: string;
  sessionId: string | null;
}

export interface ExecOptions {
  cwd?: string;
}

export interface ExecFunction {
  (command: string, options?: ExecOptions): Promise<{ stdout: string; stderr: string }>;
}

// Default exec function
const defaultExecFn: ExecFunction = async (cmd: string, options?: ExecOptions) => {
  log(`Executing command: ${cmd}`);
  if (options?.cwd) {
    log(`Working directory: ${options.cwd}`);
  }

  const startTime = Date.now();
  try {
    // Redirect stdin from /dev/null to prevent claude CLI from waiting for input
    const fullCmd = `${cmd} < /dev/null`;
    log(`Full command with stdin redirect: ${fullCmd}`);

    const result = await execAsyncRaw(fullCmd, {
      shell: '/bin/bash',
      cwd: options?.cwd || process.cwd(),
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 300000 // 5 minute timeout
    });
    const duration = Date.now() - startTime;
    log(`Command completed in ${duration}ms`);
    log(`stdout length: ${result.stdout.length} chars`);
    if (result.stderr) {
      log(`stderr: ${result.stderr}`);
    }
    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    log(`Command failed after ${duration}ms`, {
      error: error.message,
      stderr: error.stderr,
      code: error.code
    });
    throw error;
  }
};

let execFn: ExecFunction = defaultExecFn;

export function setExecFunction(fn: ExecFunction): void {
  execFn = fn;
}

export function resetExecFunction(): void {
  execFn = defaultExecFn;
}

/**
 * Parse Claude CLI JSON output
 * Claude JSON format:
 * {
 *   "type": "result",
 *   "result": "response text",
 *   "session_id": "uuid",
 *   "is_error": false,
 *   ...
 * }
 */
export function parseClaudeJsonResponse(stdout: string): { response: string; sessionId: string | null; isError: boolean } {
  log(`Parsing response (${stdout.length} chars)`);

  try {
    const json = JSON.parse(stdout);
    log(`Parsed JSON successfully`, {
      type: json.type,
      is_error: json.is_error,
      session_id: json.session_id,
      result_length: json.result?.length
    });

    return {
      response: json.result || JSON.stringify(json),
      sessionId: json.session_id || null,
      isError: json.is_error || false
    };
  } catch (e) {
    log(`Failed to parse JSON, returning raw output`, { error: (e as Error).message });
    return {
      response: stdout.trim(),
      sessionId: null,
      isError: false
    };
  }
}

export interface ClaudeOptions {
  model?: string;
  systemPrompt?: string;
  cwd?: string;
}

/**
 * Execute a new Claude session with a prompt
 * Command: claude -p "prompt" --output-format json [--model model] [--system-prompt prompt]
 */
export async function executeClaude(prompt: string, options?: ClaudeOptions): Promise<ClaudeResponse> {
  log(`executeClaude called`, {
    promptLength: prompt.length,
    model: options?.model,
    hasSystemPrompt: !!options?.systemPrompt,
    cwd: options?.cwd
  });

  const safePrompt = JSON.stringify(prompt);
  let command = `claude -p ${safePrompt} --output-format json`;

  if (options?.model) {
    command += ` --model ${options.model}`;
  }

  if (options?.systemPrompt) {
    const safeSystemPrompt = JSON.stringify(options.systemPrompt);
    command += ` --system-prompt ${safeSystemPrompt}`;
  }

  log(`Final command: ${command}`);

  const { stdout } = await execFn(command, { cwd: options?.cwd });
  const { response, sessionId, isError } = parseClaudeJsonResponse(stdout);

  if (isError) {
    log(`Claude returned an error response`);
  }

  log(`executeClaude completed`, { sessionId, responseLength: response.length });
  return { response, sessionId };
}

/**
 * Continue an existing Claude session
 *
 * If sessionId is provided: claude -r <sessionId> -p "prompt" --output-format json
 * If no sessionId (continue latest): claude -c -p "prompt" --output-format json
 */
export async function executeClaudeReply(
  prompt: string,
  sessionId?: string,
  options?: ClaudeOptions
): Promise<ClaudeResponse> {
  log(`executeClaudeReply called`, {
    promptLength: prompt.length,
    sessionId,
    model: options?.model,
    hasSystemPrompt: !!options?.systemPrompt,
    cwd: options?.cwd
  });

  const safePrompt = JSON.stringify(prompt);

  let command: string;

  if (sessionId) {
    // Resume specific session by ID
    command = `claude -r ${sessionId} -p ${safePrompt} --output-format json`;
    log(`Resuming session: ${sessionId}`);
  } else {
    // Continue the most recent session
    command = `claude -c -p ${safePrompt} --output-format json`;
    log(`Continuing most recent session`);
  }

  if (options?.model) {
    command += ` --model ${options.model}`;
  }

  if (options?.systemPrompt) {
    const safeSystemPrompt = JSON.stringify(options.systemPrompt);
    command += ` --append-system-prompt ${safeSystemPrompt}`;
  }

  log(`Final command: ${command}`);

  const { stdout } = await execFn(command, { cwd: options?.cwd });
  const { response, sessionId: newSessionId, isError } = parseClaudeJsonResponse(stdout);

  if (isError) {
    log(`Claude returned an error response`);
  }

  const finalSessionId = newSessionId || sessionId || null;
  log(`executeClaudeReply completed`, { sessionId: finalSessionId, responseLength: response.length });

  return { response, sessionId: finalSessionId };
}
