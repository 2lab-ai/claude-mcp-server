# CLAUDE.md - AI Assistant Guide

This document provides guidance for AI assistants working with the claude-mcp-server codebase.

## Project Overview

**claude-mcp-server** is a Model Context Protocol (MCP) server that bridges MCP-compliant clients (Claude Desktop, Gemini, etc.) to Anthropic's Claude CLI. It enables starting new Claude chat sessions or continuing existing ones through the MCP interface.

- **Package**: `@2lab.ai/claude-mcp-server`
- **Version**: 1.0.1
- **License**: ISC
- **Node.js**: 18+

## Repository Structure

```
claude-mcp-server/
├── claude-mcp-server.ts    # Entry point - bootstraps the server
├── src/
│   ├── server.ts           # MCP server setup and transport
│   ├── handlers.ts         # Tool definitions and request handlers
│   ├── claude-service.ts   # Claude CLI execution logic
│   ├── handlers.test.ts    # Handler unit tests
│   └── claude-service.test.ts  # Service unit tests
├── scripts/
│   └── release.sh          # Manual release helper script
├── .github/workflows/
│   └── publish.yml         # CI/CD: auto-publish to npm on main
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── Makefile                # Devcontainer commands
```

## Architecture

### Core Components

1. **Entry Point** (`claude-mcp-server.ts:1-7`)
   - Simple bootstrap that imports and runs the server

2. **Server** (`src/server.ts`)
   - Creates MCP server instance with tool capabilities
   - Sets up stdio transport for communication
   - Registers request handlers for `ListToolsRequest` and `CallToolRequest`

3. **Handlers** (`src/handlers.ts`)
   - Defines two MCP tools: `chat` and `chat-reply`
   - Routes tool calls to appropriate service functions
   - Handles errors gracefully, returning `isError: true` on failures

4. **Claude Service** (`src/claude-service.ts`)
   - Executes Claude CLI commands via `child_process.exec`
   - Parses JSON responses from Claude CLI
   - Supports dependency injection for testing via `setExecFunction`

### MCP Tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `chat` | Start new Claude session | `prompt` (required), `model`, `systemPrompt`, `cwd` |
| `chat-reply` | Continue existing session | `prompt` (required), `sessionId`, `model`, `systemPrompt`, `cwd` |

### CLI Commands Generated

```bash
# New session
claude -p "prompt" --output-format json [--model MODEL] [--system-prompt PROMPT]

# Continue specific session
claude -r SESSION_ID -p "prompt" --output-format json

# Continue most recent session
claude -c -p "prompt" --output-format json
```

## Development Workflow

### Setup

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
```

### Common Commands

```bash
npm test             # Run tests once (vitest run)
npm run test:watch   # Run tests in watch mode
npm run build        # Compile TypeScript
npm start            # Run compiled server
npm run inspect      # Test with MCP Inspector
```

### Using Devcontainer (Makefile)

```bash
make dev-up          # Start devcontainer
make dev-bash        # Shell into devcontainer
make dev-rebuild     # Force rebuild container
make dev-down        # Stop devcontainer
make dev-claude      # Run claude in devcontainer
```

## Testing

### Framework
- **Vitest** for unit testing
- Tests located in `src/*.test.ts`
- Run with `npm test`

### Testing Strategy
- Mock the exec function using `setExecFunction()` from claude-service
- Test tool definitions, handlers, and CLI command generation
- Always call `resetExecFunction()` in `afterEach` to restore defaults

### Key Test Patterns

```typescript
// Mock exec function
setExecFunction(async (command: string, options?: ExecOptions) => {
  // Verify command structure
  expect(command).toContain('--model opus');
  return {
    stdout: JSON.stringify({ result: 'OK', session_id: 'test-id' }),
    stderr: ''
  };
});

// Always reset after tests
afterEach(() => {
  resetExecFunction();
});
```

## Code Conventions

### TypeScript
- Strict mode enabled
- Target: ES2022
- Module: Node16
- All source in TypeScript, compiled to `dist/`

### Logging
- All logs go to `stderr` (not `stdout`) to avoid interfering with MCP stdio
- Format: `[timestamp] [claude-mcp-server] [component] message`
- Use the `log()` helper function in each module

### Error Handling
- Tool errors return `{ isError: true, content: [{ type: "text", text: "Error..." }] }`
- Unknown tools throw `Error("Unknown tool: ${name}")`
- CLI failures are caught and converted to error responses

### Response Format
```typescript
interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  _meta?: { sessionId: string };
}
```

## CI/CD Pipeline

### Automatic Publishing (`.github/workflows/publish.yml`)
- Triggers on push to `main` branch
- Steps: checkout, install, build, test, version check, publish
- Only publishes if `package.json` version differs from npm registry
- Requires `NPM_TOKEN` secret in GitHub repository settings

### Manual Release (`scripts/release.sh`)
- Bumps patch version by default (or specify version as argument)
- Updates `package.json` and `package-lock.json`
- Creates git tag and pushes
- Publishes to npm (supports OTP via `NPM_OTP` env var)

```bash
./scripts/release.sh           # Bump patch version
./scripts/release.sh 2.0.0     # Set specific version
NPM_OTP=123456 ./scripts/release.sh  # With 2FA code
```

## Dependencies

### Runtime
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `zod` - Schema validation

### Development
- `typescript` - TypeScript compiler
- `vitest` - Test framework
- `ts-node` - TypeScript execution
- `@types/node` - Node.js type definitions

## Important Patterns

### Session Management
- New sessions return `session_id` in `_meta.sessionId`
- Reply to specific session: use `sessionId` parameter with `-r` flag
- Continue latest session: omit `sessionId`, uses `-c` flag

### Command Execution
- Commands run with `/bin/bash` shell
- Stdin redirected from `/dev/null` to prevent CLI blocking
- 10MB buffer limit, 5-minute timeout
- Working directory configurable via `cwd` option

### JSON Response Parsing
- Claude CLI outputs JSON with `--output-format json`
- Expected fields: `type`, `result`, `session_id`, `is_error`
- Falls back to raw output if JSON parsing fails

## Quick Reference

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Build | `npm run build` |
| Run tests | `npm test` |
| Start server | `npm start` |
| Debug with inspector | `npm run inspect` |
| Release | `./scripts/release.sh` |
