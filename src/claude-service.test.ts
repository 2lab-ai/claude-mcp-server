import { describe, it, expect, afterEach } from 'vitest';
import {
  parseClaudeJsonResponse,
  executeClaude,
  executeClaudeReply,
  setExecFunction,
  resetExecFunction,
  type ExecOptions,
} from './claude-service.js';

// Mock exec function
function createMockExec(responses: Record<string, string>) {
  return async (command: string, _options?: ExecOptions): Promise<{ stdout: string; stderr: string }> => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (command.includes(pattern)) {
        return { stdout: response, stderr: '' };
      }
    }
    throw new Error(`Unexpected command: ${command}`);
  };
}

describe('claude-service', () => {
  afterEach(() => {
    resetExecFunction();
  });

  describe('parseClaudeJsonResponse', () => {
    it('should parse valid JSON response with result field', () => {
      const stdout = JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'Hello, how can I help you?',
        session_id: 'test-session-id'
      });

      const result = parseClaudeJsonResponse(stdout);

      expect(result.response).toBe('Hello, how can I help you?');
      expect(result.sessionId).toBe('test-session-id');
      expect(result.isError).toBe(false);
    });

    it('should handle JSON without session_id', () => {
      const stdout = JSON.stringify({
        result: 'Response without session'
      });

      const result = parseClaudeJsonResponse(stdout);

      expect(result.response).toBe('Response without session');
      expect(result.sessionId).toBeNull();
    });

    it('should handle JSON without result field', () => {
      const stdout = JSON.stringify({
        session_id: 'test-id',
        content: 'Some content'
      });

      const result = parseClaudeJsonResponse(stdout);

      // Should stringify the entire JSON
      expect(result.response).toContain('content');
      expect(result.sessionId).toBe('test-id');
    });

    it('should return raw stdout for invalid JSON', () => {
      const stdout = 'This is not JSON, just plain text output';

      const result = parseClaudeJsonResponse(stdout);

      expect(result.response).toBe(stdout);
      expect(result.sessionId).toBeNull();
    });

    it('should detect error responses', () => {
      const stdout = JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'An error occurred'
      });

      const result = parseClaudeJsonResponse(stdout);

      expect(result.isError).toBe(true);
    });
  });

  describe('executeClaude', () => {
    it('should execute claude command and return response with session ID', async () => {
      const mockResponse = JSON.stringify({
        type: 'result',
        result: 'Hello! I am Claude.',
        session_id: 'new-session-123'
      });

      setExecFunction(createMockExec({
        'claude -p': mockResponse
      }));

      const result = await executeClaude('Hello');

      expect(result.response).toBe('Hello! I am Claude.');
      expect(result.sessionId).toBe('new-session-123');
    });

    it('should include model parameter when provided', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test' }),
          stderr: ''
        };
      });

      await executeClaude('Test prompt', { model: 'opus' });

      expect(capturedCommand).toContain('--model opus');
    });

    it('should include system prompt when provided', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test' }),
          stderr: ''
        };
      });

      await executeClaude('Test', { systemPrompt: 'You are a helpful assistant.' });

      expect(capturedCommand).toContain('--system-prompt');
      expect(capturedCommand).toContain('helpful assistant');
    });

    it('should pass cwd option', async () => {
      let capturedOptions: ExecOptions | undefined;
      setExecFunction(async (command: string, options?: ExecOptions) => {
        capturedOptions = options;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test' }),
          stderr: ''
        };
      });

      await executeClaude('Test', { cwd: '/some/path' });

      expect(capturedOptions?.cwd).toBe('/some/path');
    });

    it('should use -p flag for print mode', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test' }),
          stderr: ''
        };
      });

      await executeClaude('Test prompt');

      expect(capturedCommand).toContain('claude -p');
      expect(capturedCommand).toContain('--output-format json');
    });

    it('should properly escape special characters in prompt', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test' }),
          stderr: ''
        };
      });

      await executeClaude('Hello "world" with \'quotes\'');

      // JSON.stringify should handle escaping
      expect(capturedCommand).toContain('\\"world\\"');
    });
  });

  describe('executeClaudeReply', () => {
    it('should use -c flag when no sessionId provided (continue latest)', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'Continued', session_id: 'latest-session' }),
          stderr: ''
        };
      });

      const result = await executeClaudeReply('Continue please');

      expect(capturedCommand).toContain('claude -c -p');
      expect(capturedCommand).not.toContain('-r');
      expect(result.response).toBe('Continued');
    });

    it('should use -r flag with sessionId when provided', async () => {
      let capturedCommand = '';

      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'Replied', session_id: '22222222-0000-0000-0000-000000000002' }),
          stderr: ''
        };
      });

      const result = await executeClaudeReply('Reply to this', '22222222-0000-0000-0000-000000000002');

      expect(capturedCommand).toContain('-r 22222222-0000-0000-0000-000000000002');
      expect(capturedCommand).toContain('-p');
      expect(result.response).toBe('Replied');
      expect(result.sessionId).toBe('22222222-0000-0000-0000-000000000002');
    });

    it('should include model parameter when provided', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test' }),
          stderr: ''
        };
      });

      await executeClaudeReply('Test', undefined, { model: 'sonnet' });

      expect(capturedCommand).toContain('--model sonnet');
    });

    it('should include append-system-prompt when provided', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test' }),
          stderr: ''
        };
      });

      await executeClaudeReply('Test', 'session-123', { systemPrompt: 'Be concise' });

      expect(capturedCommand).toContain('--append-system-prompt');
    });

    it('should preserve sessionId when not returned in response', async () => {
      setExecFunction(async () => {
        return {
          stdout: JSON.stringify({ result: 'OK' }), // No session_id in response
          stderr: ''
        };
      });

      const result = await executeClaudeReply('Test', 'original-session-id');

      expect(result.sessionId).toBe('original-session-id');
    });

    it('should pass cwd option', async () => {
      let capturedOptions: ExecOptions | undefined;
      setExecFunction(async (command: string, options?: ExecOptions) => {
        capturedOptions = options;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test' }),
          stderr: ''
        };
      });

      await executeClaudeReply('Test', undefined, { cwd: '/another/path' });

      expect(capturedOptions?.cwd).toBe('/another/path');
    });
  });
});
