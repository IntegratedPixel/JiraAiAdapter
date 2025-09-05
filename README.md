# Jira CLI

AI-friendly command-line interface for Jira, designed to enable AI assistants (Claude Code, Cursor) to interact with Jira directly from the terminal.

## Features

### Current Release (v0.4.0)

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
- ✅ **Update issues** with field modifications, status transitions, story points, and file-based descriptions
- ✅ **Delete issues** with confirmation prompts
- ✅ **Comment on issues** with text, file, or editor input
- ✅ **Transition issues** through workflows with smart status discovery
- ✅ **Batch operations** for multiple issue management (JSON, CSV, Markdown)
- ✅ **Issue types** command to list available types
- ✅ **JQL support** for advanced queries
- ✅ **ADF support** for rich text formatting
- ✅ **Table output** for better readability

### Coming Soon
- Sprint management commands
- Advanced AI assistant features (context generation)
- Issue attachment management
- Performance optimizations



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

### Option 1: Environment Variables (Recommended for CI/CD)
```bash
# Set required environment variables
export JIRA_HOST=yourcompany.atlassian.net
export JIRA_EMAIL=your.email@company.com
export JIRA_TOKEN=your_api_token_here
export JIRA_PROJECT=PROJ

# Start using immediately - no setup needed!
jira list --mine        # List your issues
jira create --type Bug --summary "Fix login"
jira comment PROJ-123 "Fixed the issue"  # Add comments
jira view PROJ-123     # View issue details
```

### Option 2: Interactive Setup
```bash
# 1. Set up global authentication (one time)
jira auth set

# 2. Initialize project configuration (per project)  
cd /path/to/your/project
jira init

# 3. Start using the CLI
jira list --mine        # List your issues
jira create            # Create a new issue
jira view PROJ-123     # View issue details
```

### Check Configuration Status
```bash
jira status            # Shows configuration completeness
jira status --verbose  # Shows configuration sources
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
2. **Environment variables** - Perfect for CI/CD, Docker, enterprise environments
3. **Project config** - `.jirarc.json` in current directory
4. **Global config** - `~/.jirarc.json` in home directory

### Environment Variables

Environment variables provide a complete, non-interactive setup method perfect for enterprise and CI/CD use:

#### Required Variables
```bash
JIRA_HOST=yourcompany.atlassian.net    # Your Atlassian instance
JIRA_EMAIL=user@company.com            # Your email address
JIRA_TOKEN=your_api_token              # API token (or JIRA_API_TOKEN)
JIRA_PROJECT=PROJ                      # Project key
```

#### Optional Variables
```bash
JIRA_BOARD="Development Board"         # Default board for sprints
JIRA_DEFAULT_TYPE=Task                 # Default issue type
JIRA_DEFAULT_ASSIGNEE=me               # Default assignee
JIRA_DEFAULT_PRIORITY=Medium           # Default priority  
JIRA_DEFAULT_LABELS=backend,api        # Default labels (comma-separated)
```

#### Setup Methods
```bash
# Method 1: Export directly
export JIRA_HOST=company.atlassian.net
export JIRA_TOKEN=your_token_here

# Method 2: Create .env file (copy from .env.example)
cp .env.example .env
# Edit .env with your values

# Method 3: CI/CD secrets (GitHub Actions example)
env:
  JIRA_HOST: company.atlassian.net
  JIRA_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
```

With environment variables set, the CLI works immediately without any interactive setup!

## Multi-Project Support

### Command-Line Project Overrides

All commands support `--project` and `--board` flags to work across multiple projects in a single session:

```bash
# Work with different projects using the same CLI setup
jira list --project FRONTEND                    # List frontend issues  
jira create --project BACKEND --type Bug --summary "API issue"
jira view MOBILE-123 --project MOBILE          # View mobile project issue
jira batch create issues.csv --project INFRA   # Bulk create in infrastructure project

# Specify both project and board
jira list --project FRONTEND --board "UI Board" --sprint current
```

### Use Cases
- **Claude/AI workflows** - Work across related microservices simultaneously
- **Multi-team support** - Frontend/backend teams sharing Jira instance  
- **Cross-project features** - Track work spanning multiple components
- **Client work** - Manage multiple client projects from one location

### How It Works
```bash
# Base configuration (from .env or config files)
JIRA_PROJECT=DEFAULT_PROJ
JIRA_BOARD=Default Board

# Command overrides work dynamically  
jira list                           # Uses DEFAULT_PROJ
jira list --project SPECIAL_PROJ    # Uses SPECIAL_PROJ for this command only
jira status                         # Still shows DEFAULT_PROJ as base config
```

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
# List all issues in project (includes story points column)
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
# View issue details (includes story points if set)
jira view PROJ-123

# Include comments
jira view PROJ-123 --comments

# Open in browser
jira view PROJ-123 --open

# Get JSON output
jira view PROJ-123 --comments --json

# Work across projects
jira view FRONTEND-456 --project FRONTEND --comments
```

### Create Issue

```bash
# Interactive creation
jira create

# Use a template
jira create --template bug

# Quick creation with parameters (non-interactive)
jira create --type Task --summary "Update documentation" --description "Need to update API docs"

# Create with story points
jira create --type Story --summary "Add user dashboard" --story-points 8 --priority High

# Create in different project
jira create --project MOBILE --type Bug --summary "iOS crash on login"

# Dry run to preview
jira create --template feature --dry-run

# Create from file
jira create --description-file ./issue-description.md

**Note:** When using command-line options, both `--type` and `--summary` are required for non-interactive mode.
```

### Update Issue

```bash
# Update issue fields
jira update PROJ-123 --summary "New title" --priority High

# Update description from file
jira update PROJ-123 --description-file ./updated-description.md

# Update story points
jira update PROJ-123 --story-points 5

# Smart status transition with comment (automatically finds the right workflow transition)
jira update PROJ-123 --status "In Progress" --comment "Starting work"
jira update PROJ-123 --status "Done" --comment "Task completed"

# Update labels
jira update PROJ-123 --labels add:urgent,backend
jira update PROJ-123 --labels remove:old-label
jira update PROJ-123 --labels set:new-label,another-label

# Convert to sub-task
jira update PROJ-123 --parent PROJ-100 --type Sub-task

# Preview changes without applying
jira update PROJ-123 --summary "New title" --dry-run
```

### Add Comments

```bash
# Quick comment
jira comment PROJ-123 "Fixed the login issue, ready for testing"

# Comment from file
jira comment PROJ-123 --file ./review-notes.md

# Interactive editor mode (no message provided)
jira comment PROJ-123

# Comment on issue in different project
jira comment MOBILE-456 --project MOBILE "Tested on iOS, works great"
```

### Transition Issues

```bash
# Smart status transition (finds the right workflow transition)
jira update PROJ-123 --status "Done" --comment "Task completed"

# Explicit transition control
jira transition PROJ-123 "Complete Task" --comment "Finished implementation"
jira transition PROJ-123 --to "In Review" --comment "Ready for review"

# List available transitions
jira transition PROJ-123 --list

# Transition with file-based comment
jira transition PROJ-123 --to "Done" --comment-file ./completion-notes.md

# Multi-project transitions
jira transition MOBILE-456 --project MOBILE --to "Testing"
```

### Batch Operations

```bash
# Generate CSV template
jira batch template --output issues.csv

# Create issues from CSV file
jira batch create issues.csv

# Create issues from JSON file
jira batch create issues.json

# Create issues from Markdown file
jira batch create tasks.md

# Preview what would be created (dry run)
jira batch create issues.csv --dry-run

# Interactive review and editing
jira batch create issues.csv --interactive

# Add default labels and assignee
jira batch create issues.csv --labels "sprint-42,backend" --assignee "dev@example.com"

# Parse markdown and save as JSON
jira batch parse tasks.md --output parsed-issues.json
```

#### CSV Format

The CSV file should have these columns (case-insensitive):
- **Summary** (required) - Issue title
- **Type** - Bug, Story, Task, Epic, etc.
- **Priority** - Highest, High, Medium, Low, Lowest
- **Description** - Detailed description
- **Labels** - Comma or pipe separated (e.g., "ui,frontend" or "ui|frontend")
- **Assignee** - Email or username
- **Story Points** - Numeric value (e.g., 1, 2, 3, 5, 8)
- **Components** - Comma or pipe separated
- **Parent** - Parent issue key (for sub-tasks)

Example CSV:
```csv
Summary,Type,Priority,Description,Labels,Assignee,Story Points
Fix login bug,Bug,High,"User cannot login after update",authentication,john@example.com,3
Add dark mode,Story,Medium,"Users want dark theme",ui|ux,jane@example.com,5
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

## Troubleshooting

### Common Issues

#### Batch Create 400 Errors
If `jira batch create` fails with 400 errors:
1. Use `--debug` flag to see detailed error information
2. Check that issue types match your Jira project (use `jira types` to list available types)
3. Some fields may not be available in your project - the CLI will automatically retry without unavailable fields
4. Story points field varies by Jira instance - the CLI tries common custom fields automatically

#### Interactive Mode When Not Expected
If `jira create --type Story` still prompts for input:
- Ensure you provide both `--type` and `--summary` for non-interactive mode
- Run `jira create --help` to see all available options

#### Story Points Not Working
- Story points use custom fields that vary by Jira instance
- The CLI automatically detects and tries common story points fields
- Use `--debug` mode to see which field is being used

## License

ISC

## Contributing

See [SETUP.md](./SETUP.md) for detailed implementation plan and architecture.