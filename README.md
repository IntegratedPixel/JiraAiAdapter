# Jira CLI

AI-friendly command-line interface for Jira, designed to enable AI assistants (Claude Code, Cursor) to interact with Jira directly from the terminal.

## Features

### Current Release (v0.2.0)

#### Foundation
- ✅ Secure credential management with keychain support
- ✅ Configuration via environment variables, `.jirarc.json`, or package.json
- ✅ Connection testing and validation
- ✅ Debug mode with redacted sensitive information
- ✅ JSON output mode for AI consumption
- ✅ Structured error handling with exit codes

#### Core Commands
- ✅ **List issues** with powerful filtering (status, assignee, type, priority, labels, sprint)
- ✅ **View issue details** with comments and history support
- ✅ **Create issues** with interactive mode and templates (bug, feature, task)
- ✅ **JQL support** for advanced queries
- ✅ **ADF support** for rich text formatting
- ✅ **Table output** for better readability

### Coming Soon
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

## Quick Start

### 1. Set up global authentication (one time)
```bash
jira auth set
# Enter your Atlassian host, email, and API token
```

### 2. Initialize project configuration (per project)
```bash
cd /path/to/your/project
jira init
# Select your project key and configure defaults
```

### 3. Start using the CLI
```bash
jira list --mine        # List your issues
jira create            # Create a new issue
jira view PROJ-123     # View issue details
```

## Multi-Project Configuration

The CLI separates global authentication from project-specific settings, enabling seamless work across multiple projects.

### Global Configuration (`~/.jirarc.json`)
Stores authentication credentials (set once, use everywhere):
- **Host**: Your Atlassian instance
- **Email**: Your email address  
- **API Token**: Stored securely in system keychain

### Project Configuration (`.jirarc.json`)
Stores project-specific settings (per repository):
- **Project Key**: The Jira project (e.g., `CB`, `EE`)
- **Board**: Default Agile board
- **Default Issue Type**: Task, Bug, Story, etc.
- **Default Assignee**: Email or "me"
- **Default Labels**: Auto-applied to new issues
- **Default Priority**: Highest, High, Medium, Low, Lowest

### Configuration Priority

Settings are resolved in this order:
1. **Command-line flags** - Override everything
2. **Environment variables** - For CI/CD or temporary overrides
3. **Project config** - `.jirarc.json` in current directory
4. **Global config** - `~/.jirarc.json` in home directory

### Example: Multiple Projects

```bash
# One-time global setup
jira auth set
# Host: yourcompany.atlassian.net
# Email: you@example.com
# Token: [your-api-token]

# Configure CelestialBeacon
cd ~/Code/CelestialBeacon
jira init
# Project: CB
# Board: CelestialBeacon Board
# Default Type: Task
# Default Labels: game, celestial-beacon

# Configure EvergreenExile
cd ~/Code/EvergreenExile
jira init
# Project: EE
# Board: EvergreenExile Board
# Default Type: Story
# Default Labels: game, evergreen-exile

# Now each project uses its own settings automatically!
cd ~/Code/CelestialBeacon && jira list  # Shows CB issues
cd ~/Code/EvergreenExile && jira list   # Shows EE issues
```

### Required Configuration

- **Global**: Host, Email, API Token - [Generate token here](https://id.atlassian.com/manage-profile/security/api-tokens)
- **Project**: Project key (minimum requirement)

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

### List Issues

```bash
# List all issues in project
jira list

# Filter by status
jira list --status "In Progress"

# Show only my issues
jira list --mine

# Filter by multiple criteria
jira list --type Bug --priority High --limit 10

# Use custom JQL
jira list --jql "project = PROJ AND sprint in openSprints()"

# Output as JSON for AI processing
jira list --mine --json
```

### View Issue

```bash
# View issue details
jira view PROJ-123

# Include comments
jira view PROJ-123 --comments

# Open in browser
jira view PROJ-123 --open

# Get JSON output
jira view PROJ-123 --comments --json
```

### Create Issue

```bash
# Interactive creation
jira create

# Use a template
jira create --template bug

# Quick creation with parameters
jira create --type Task --summary "Update documentation" --description "Need to update API docs"

# Dry run to preview
jira create --template feature --dry-run

# Create from file
jira create --description-file ./issue-description.md
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