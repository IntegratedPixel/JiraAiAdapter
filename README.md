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

### Update Issue

```bash
# Update issue status (transition)
jira update PROJ-123 --status "In Progress"

# Update multiple fields
jira update PROJ-123 --priority High --assignee "john@example.com"

# Add/remove labels
jira update PROJ-123 --labels "add:backend,api remove:frontend"

# Set labels (replace all)
jira update PROJ-123 --labels "set:urgent,production"

# Assign to yourself
jira update PROJ-123 --assignee me

# Unassign issue
jira update PROJ-123 --assignee unassigned

# Add comment with update
jira update PROJ-123 --status "Done" --comment "Fixed in PR #42"

# Dry run to preview changes
jira update PROJ-123 --priority Critical --dry-run
```

### Comment on Issues

```bash
# Add a simple comment
jira comment PROJ-123 "This is my comment"

# Add comment from file
jira comment PROJ-123 --file ./comment.md

# Mention users in comment
jira comment PROJ-123 "Please review" --mention john@example.com jane@example.com

# Preview comment without posting
jira comment PROJ-123 "Draft comment" --dry-run
```

### Sprint Management

```bash
# View current sprint
jira sprint

# View next sprint
jira sprint --next

# View specific sprint by name
jira sprint --name "Sprint 23"

# Specify board (if not configured)
jira sprint --board "My Team Board"

# Get sprint with custom fields
jira sprint --fields key,summary,status,assignee
```

### Attach Files

```bash
# Attach a file to an issue
jira attach PROJ-123 ./screenshot.png

# Attach multiple files (run command multiple times)
jira attach PROJ-123 ./log1.txt
jira attach PROJ-123 ./log2.txt

# Preview attachment (dry run)
jira attach PROJ-123 ./large-file.pdf --dry-run
```

### Link Issues

```bash
# Create a link between issues
jira link PROJ-123 PROJ-456 --type "blocks"

# Default link type is "relates to"
jira link PROJ-123 PROJ-789

# List available link types
jira link --list

# Preview link creation
jira link PROJ-123 PROJ-456 --type "duplicates" --dry-run
```

### Watch Issues

```bash
# Start watching an issue
jira watch PROJ-123

# Stop watching an issue
jira watch PROJ-123 --unwatch

# List watchers for an issue
jira watch PROJ-123 --list
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