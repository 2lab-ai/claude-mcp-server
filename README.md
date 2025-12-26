# Claude MCP Server

A Model Context Protocol (MCP) server that provides a bridge to Anthropic's Claude CLI. This allows MCP-compliant clients (like Claude Desktop or Gemini) to interact with the Claude CLI to start new chat sessions or continue existing ones.

## Features

- **Start New Sessions**: Initiate a new conversation with a specific Claude model.
- **Continue Sessions**: Reply to existing sessions using their Session ID.
- **Session Management**: Automatically continues the latest session if no Session ID is provided.
- **Model Selection**: Supports specifying different Claude models (e.g., `sonnet`, `opus`, `haiku`).
- **System Prompt**: Native support for custom system prompts.
- **Working Directory**: Specify custom working directory for CLI execution.

## Prerequisites

- Node.js 18+
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Authenticate
claude setup-token
```

## Installation

### Global Installation

```bash
npm install -g @2lab.ai/claude-mcp-server
```

### Run directly with npx

```bash
npx @2lab.ai/claude-mcp-server
```

## Usage

### Running the server

After global installation:

```bash
claude-mcp-server
```

Or with npx:

```bash
npx @2lab.ai/claude-mcp-server
```

### Testing with MCP Inspector

You can test and debug the server using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx @2lab.ai/claude-mcp-server
```

Or if globally installed:

```bash
npx @modelcontextprotocol/inspector claude-mcp-server
```

### Claude Desktop Configuration

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "claude-cli": {
      "command": "npx",
      "args": ["-y", "@2lab.ai/claude-mcp-server"]
    }
  }
}
```

Or if globally installed:

```json
{
  "mcpServers": {
    "claude-cli": {
      "command": "claude-mcp-server"
    }
  }
}
```

### Claude Code Configuration

Add to your Claude Code settings:

```json
{
  "mcpServers": {
    "claude-cli": {
      "command": "npx",
      "args": ["-y", "@2lab.ai/claude-mcp-server"]
    }
  }
}
```

## Available Tools

### `chat`

Start a new Claude session with a prompt.

**Parameters:**
- `prompt` (required): The prompt to start the session with
- `model` (optional): The model to use (e.g., 'sonnet', 'opus', 'haiku')
- `systemPrompt` (optional): System prompt to set the assistant's behavior
- `cwd` (optional): Working directory for the claude CLI execution

**Returns:** Response text and new Session ID in `_meta.sessionId`

### `chat-reply`

Continue an existing Claude session.

**Parameters:**
- `prompt` (required): The prompt to continue the conversation
- `sessionId` (optional): The session ID to continue. If not provided, continues the most recent session
- `model` (optional): The model to use for this turn
- `systemPrompt` (optional): Additional system prompt to append for this turn
- `cwd` (optional): Working directory for the claude CLI execution

**Returns:** Response text and Session ID in `_meta.sessionId`

## Development

```bash
# Clone the repository
git clone https://github.com/2lab-ai/claude-mcp-server.git
cd claude-mcp-server

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run locally
npm start

# Test with MCP Inspector
npm run inspect
```

## CI/CD

This project uses GitHub Actions to automatically publish to npm when changes are pushed to the `main` branch.

To enable automatic publishing:

1. Generate an npm access token from [npmjs.com](https://www.npmjs.com/settings/~/tokens)
2. Add the token as a secret named `NPM_TOKEN` in your GitHub repository settings
3. Bump the version in `package.json` before pushing to trigger a publish

## License

ISC
