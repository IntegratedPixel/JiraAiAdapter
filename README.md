# Jira CLI

AI-friendly command-line interface for Jira, designed to enable AI assistants (Claude Code, Cursor) to interact with Jira directly from the terminal.

## Features

### Phase 1 (Current Release)
- ✅ Secure credential management with keychain support
- ✅ Configuration via environment variables, `.jirarc.json`, or package.json
- ✅ Connection testing and validation
- ✅ Debug mode with redacted sensitive information
- ✅ JSON output mode for AI consumption
- ✅ Structured error handling with exit codes

### Coming Soon
- Phase 2: Core commands (list, view, create)
- Phase 3: Advanced commands (update, comment, sprint)
- Phase 4: AI assistant features (batch operations, context generation)
- Phase 5: Polish and performance optimizations

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Link for global usage (optional)
npm link
```

## Configuration

### Quick Setup

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Run the interactive setup:
```bash
jira auth set
```

### Configuration Methods

The CLI supports multiple configuration methods (in priority order):

1. **Environment Variables** (`.env` file)
2. **Local Config** (`.jirarc.json` in current directory)
3. **Global Config** (`~/.jirarc.json` in home directory)
4. **Package.json** (`jira` section)

### Required Configuration

- `JIRA_HOST`: Your Atlassian instance (e.g., `yourcompany.atlassian.net`)
- `JIRA_EMAIL`: Your email address
- `JIRA_TOKEN`: API token (not password) - [Generate here](https://id.atlassian.com/manage-profile/security/api-tokens)
- `JIRA_PROJECT`: Default project key (e.g., `PROJ`)

## Usage

### Authentication

```bash
# Set up authentication interactively
jira auth set

# Test connection
jira auth test

# Clear stored credentials
jira auth clear
```

### Global Options

```bash
# Enable debug mode
jira --debug <command>

# Output in JSON format (for AI consumption)
jira --json <command>

# Suppress non-error output
jira --quiet <command>

# Show version
jira --version

# Show help
jira --help
```

### Check Configuration Status

```bash
jira status
```

## AI Assistant Integration

The CLI is designed for seamless integration with AI assistants:

### JSON Output Format

When using `--json` flag, all commands return a consistent structure:

```json
{
  "ok": true,
  "data": { ... },
  "error": null
}
```

Error response:
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "AUTH",
    "message": "Authentication failed",
    "details": { ... }
  }
}
```

### Exit Codes

- `0`: Success
- `1`: Unknown error
- `2`: Invalid arguments
- `3`: Authentication error
- `4`: Resource not found
- `5`: Rate limit exceeded
- `6`: Network error

### Example AI Usage

```bash
# Get connection status as JSON
jira --json auth test

# Check configuration
jira --json status
```

## Development

```bash
# Run in development mode
npm run dev

# Run linter
npm run lint

# Format code
npm run format

# Run tests
npm run test

# Build for production
npm run build
```

## Security

- API tokens are stored securely in the system keychain when available
- Sensitive information is redacted in debug output
- Never commit `.env` or `.jirarc.json` files
- Use API tokens, not passwords

## License

ISC

## Contributing

See [SETUP.md](./SETUP.md) for detailed implementation plan and architecture.