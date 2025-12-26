import { describe, it, expect, afterEach } from 'vitest';
import { TOOLS, handleClaude, handleClaudeReply, handleToolCall } from './handlers.js';
import { setExecFunction, resetExecFunction, type ExecOptions } from './claude-service.js';

// Mock exec function for testing
function createMockExec(responses: Record<string, string | (() => string)>) {
  return async (command: string, _options?: ExecOptions): Promise<{ stdout: string; stderr: string }> => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (command.includes(pattern)) {
        const stdout = typeof response === 'function' ? response() : response;
        return { stdout, stderr: '' };
      }
    }
    throw new Error(`Unexpected command: ${command}`);
  };
}

describe('Handlers', () => {
  afterEach(() => {
    resetExecFunction();
  });

  describe('TOOLS definition', () => {
    it('should have chat and chat-reply tools', () => {
      expect(TOOLS).toHaveLength(2);
      expect(TOOLS[0].name).toBe('chat');
      expect(TOOLS[1].name).toBe('chat-reply');
    });

    it('chat tool should have correct schema with systemPrompt and cwd', () => {
      const claudeTool = TOOLS.find(t => t.name === 'chat');
      expect(claudeTool).toBeDefined();
      expect(claudeTool!.inputSchema.properties).toHaveProperty('prompt');
      expect(claudeTool!.inputSchema.properties).toHaveProperty('model');
      expect(claudeTool!.inputSchema.properties).toHaveProperty('systemPrompt');
      expect(claudeTool!.inputSchema.properties).toHaveProperty('cwd');
      expect(claudeTool!.inputSchema.required).toContain('prompt');
    });

    it('chat-reply tool should have correct schema with systemPrompt and cwd', () => {
      const replyTool = TOOLS.find(t => t.name === 'chat-reply');
      expect(replyTool).toBeDefined();
      expect(replyTool!.inputSchema.properties).toHaveProperty('prompt');
      expect(replyTool!.inputSchema.properties).toHaveProperty('sessionId');
      expect(replyTool!.inputSchema.properties).toHaveProperty('model');
      expect(replyTool!.inputSchema.properties).toHaveProperty('systemPrompt');
      expect(replyTool!.inputSchema.properties).toHaveProperty('cwd');
      expect(replyTool!.inputSchema.required).toContain('prompt');
    });
  });

  describe('handleClaude', () => {
    it('should execute claude and return response with _meta.sessionId', async () => {
      const mockResponse = JSON.stringify({
        type: 'result',
        result: 'Hello! I am Claude, ready to help.',
        session_id: 'new-session-12345678-0000-0000-0000-000000000000'
      });

      setExecFunction(createMockExec({
        'claude': mockResponse
      }));

      const result = await handleClaude({ prompt: 'Hello' });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Hello! I am Claude, ready to help.');
      expect(result._meta?.sessionId).toBe('new-session-12345678-0000-0000-0000-000000000000');
    });

    it('should pass model parameter', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test-id-0000-0000-0000-000000000000' }),
          stderr: ''
        };
      });

      await handleClaude({ prompt: 'Test', model: 'opus' });

      expect(capturedCommand).toContain('--model opus');
    });

    it('should pass systemPrompt parameter', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test-id' }),
          stderr: ''
        };
      });

      await handleClaude({ prompt: 'Test', systemPrompt: 'Be helpful' });

      expect(capturedCommand).toContain('--system-prompt');
    });

    it('should pass cwd parameter', async () => {
      let capturedOptions: ExecOptions | undefined;
      setExecFunction(async (command: string, options?: ExecOptions) => {
        capturedOptions = options;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test-id' }),
          stderr: ''
        };
      });

      await handleClaude({ prompt: 'Test', cwd: '/my/project' });

      expect(capturedOptions?.cwd).toBe('/my/project');
    });
  });

  describe('handleClaudeReply', () => {
    it('should use -c when no sessionId provided', async () => {
      let capturedCommand = '';
      setExecFunction(async (command: string) => {
        capturedCommand = command;
        return {
          stdout: JSON.stringify({ result: 'Continued conversation', session_id: 'cont-id' }),
          stderr: ''
        };
      });

      const result = await handleClaudeReply({ prompt: 'Continue please' });

      expect(capturedCommand).toContain('-c');
      expect(result.content[0].text).toContain('Continued conversation');
    });

    it('should pass sessionId with -r flag', async () => {
      let capturedReplyCommand = '';

      setExecFunction(async (command: string) => {
        capturedReplyCommand = command;
        return {
          stdout: JSON.stringify({ result: 'Replied to session', session_id: '22222222-0000-0000-0000-000000000002' }),
          stderr: ''
        };
      });

      const result = await handleClaudeReply({
        prompt: 'Reply to this',
        sessionId: '22222222-0000-0000-0000-000000000002'
      });

      expect(capturedReplyCommand).toContain('-r 22222222-0000-0000-0000-000000000002');
      expect(result.content[0].text).toContain('Replied to session');
      expect(result._meta?.sessionId).toBe('22222222-0000-0000-0000-000000000002');
    });

    it('should pass systemPrompt and cwd parameters', async () => {
      let capturedCommand = '';
      let capturedOptions: ExecOptions | undefined;
      setExecFunction(async (command: string, options?: ExecOptions) => {
        capturedCommand = command;
        capturedOptions = options;
        return {
          stdout: JSON.stringify({ result: 'OK', session_id: 'test-id' }),
          stderr: ''
        };
      });

      await handleClaudeReply({
        prompt: 'Test',
        sessionId: 'session-123',
        systemPrompt: 'Be brief',
        cwd: '/work/dir'
      });

      expect(capturedCommand).toContain('--append-system-prompt');
      expect(capturedOptions?.cwd).toBe('/work/dir');
    });
  });

  describe('handleToolCall', () => {
    it('should route chat tool call correctly', async () => {
      setExecFunction(createMockExec({
        'claude': JSON.stringify({ result: 'Hello', session_id: 'test-session' })
      }));

      const result = await handleToolCall('chat', { prompt: 'Hello' });

      expect(result.content[0].text).toContain('Hello');
    });

    it('should route chat-reply tool call correctly', async () => {
      setExecFunction(createMockExec({
        'claude': JSON.stringify({ result: 'Continued', session_id: 'test-session' })
      }));

      const result = await handleToolCall('chat-reply', { prompt: 'Continue' });

      expect(result.content[0].text).toContain('Continued');
    });

    it('should handle errors gracefully', async () => {
      setExecFunction(async () => {
        throw new Error('Claude CLI not found');
      });

      const result = await handleToolCall('chat', { prompt: 'Hello' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error executing claude');
    });

    it('should throw error for unknown tool', async () => {
      await expect(handleToolCall('unknown-tool', {}))
        .rejects.toThrow('Unknown tool: unknown-tool');
    });
  });

  describe('End-to-End Flow', () => {
    it('should support multi-turn conversation with _meta', async () => {
      const sessionId = 'e2e00001-0000-0000-0000-000000000001';
      let claudeCallCount = 0;

      setExecFunction(async (command: string) => {
        claudeCallCount++;

        if (command.includes('-r ')) {
          // This is a reply call - should use -r with session ID
          expect(command).toContain(`-r ${sessionId}`);
          return {
            stdout: JSON.stringify({
              result: 'Sure, I remember our conversation.',
              session_id: sessionId
            }),
            stderr: ''
          };
        } else if (command.includes('-c')) {
          // This is a continue call (no session ID provided)
          return {
            stdout: JSON.stringify({
              result: 'Continuing the latest conversation.',
              session_id: sessionId
            }),
            stderr: ''
          };
        } else {
          // This is a new session call
          return {
            stdout: JSON.stringify({
              result: 'Hello! How can I help you today?',
              session_id: sessionId
            }),
            stderr: ''
          };
        }
      });

      // First turn - new session
      const firstResult = await handleToolCall('chat', { prompt: 'Hello' });
      expect(firstResult.content[0].text).toContain('Hello! How can I help you today?');
      expect(firstResult._meta?.sessionId).toBe(sessionId);

      // Second turn - reply using session ID
      const secondResult = await handleToolCall('chat-reply', {
        prompt: 'Do you remember?',
        sessionId: sessionId
      });
      expect(secondResult.content[0].text).toContain('Sure, I remember our conversation.');
      expect(secondResult._meta?.sessionId).toBe(sessionId);

      // Verify we made 2 claude calls
      expect(claudeCallCount).toBe(2);
    });
  });
});
