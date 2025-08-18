# JIRA CLI - Strategy & Implementation

## Standalone Project Notice

**This is a STANDALONE npm package project** designed to be:
- **Independent**: Separate repository and versioning from any specific project
- **Reusable**: Install globally (`npm install -g @yourorg/jira-cli`) or as a dev dependency in any project
- **AI-Friendly**: Designed specifically for AI assistants (Claude Code, Cursor) to interact with Jira
- **Cross-Project**: Use the same tool across all your projects with consistent commands
- **Publishing Ready**: Can be published to npm registry or used via git dependency

### Installation Methods (once built)
```bash
# Global installation (recommended for cross-project use)
npm install -g @yourorg/jira-cli

# Project-specific installation
npm install --save-dev @yourorg/jira-cli

# Direct from git (private use)
npm install git+https://github.com/yourorg/jira-cli.git
```

### Repository Structure
This tool should be developed in its own repository (e.g., `~/Code/jira-cli`) with:
- Its own git repository and version control
- Independent package.json with `bin` entry for CLI
- CI/CD pipeline for testing and publishing
- Separate issue tracking and documentation

## Overview
This document outlines the strategy and implementation for a standalone Jira CLI tool that enables command-line interaction with Jira. While initially conceived for the CelestialVanguard project, this tool is designed as a reusable package that bridges the gap for AI assistants (Claude Code, Cursor) that don't have native Jira access across ANY project.

## Strategy

### Problem Statement
- AI coding assistants lack native Jira integration
- Context switching to Claude web for Jira tasks disrupts workflow
- Need unified ticket management across different development environments
- Want to maintain ticket history and traceability within the codebase workflow

### Solution Approach
Build a lightweight Node.js CLI tool that:
1. Lives as a standalone package, installable in any repository
2. Provides essential Jira operations via command line
3. Can be invoked by AI assistants using bash commands
4. Maintains secure credential management with keychain support
5. Offers both interactive and scriptable interfaces with consistent JSON output for AI consumption

### Goals
- **Primary**: Enable AI assistants to read, create, and update Jira tickets
- **Secondary**: Streamline developer workflow with quick CLI commands
- **Tertiary**: Generate reports and summaries from Jira data

### Non-Goals
- Full Jira UI replacement
- Complex workflow automation (keep it simple)
- Multi-project management (focus on current project)

## Technical Architecture
### Jira Cloud & API Compatibility
- Comments and rich content use Atlassian Document Format (ADF). Plain markdown and `@username` mentions are not sufficient; construct ADF payloads and resolve mentions to `accountId`.
- Status updates use transition IDs, not names. Query `/rest/api/3/issue/{key}/transitions` and map names→IDs.
- Custom fields appear as `customfield_#####`. Discover via create metadata and cache a name→id map.
- Agile endpoints live under `/rest/agile/1.0/` and require resolving boards and sprints by name. Cache defaults.
- Handle 429 rate limits using `Retry-After` and exponential backoff with jitter.

### Technology Stack
- **Runtime**: Node.js (already in the project)
- **Language**: TypeScript (type safety for Jira schemas and ADF)
- **HTTP Client**: `got` (direct REST for v3 + Agile); `jira-client` optional
- **CLI Framework**: `commander` (clean API, good help generation)
- **Config Management**: `dotenv` + `cosmiconfig` + `keytar` (secure credential storage)
- **Output Formatting**: `chalk` (colored output) + `cli-table3` (tables)
- **Interactive Mode**: `inquirer` (for guided ticket creation)
- **Testing**: `vitest` + `nock` (unit/integration with HTTP mocks)

### Directory Structure
```
/jira-cli/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── commands/          # Command implementations
│   │   ├── list.ts        # List tickets
│   │   ├── create.ts      # Create ticket
│   │   ├── update.ts      # Update ticket
│   │   ├── view.ts        # View ticket details
│   │   └── comment.ts     # Add comment
│   ├── config/
│   │   └── jira.ts        # Configuration loader
│   ├── clients/           # REST wrappers for Core + Agile
│   │   ├── core.ts
│   │   └── agile.ts
│   ├── utils/
│   │   ├── formatter.ts   # Output formatting
│   │   ├── validator.ts   # Input validation
│   │   └── adf.ts         # ADF helpers (text→ADF, mentions)
│   └── templates/         # Ticket templates
│       ├── bug.json
│       ├── feature.json
│       └── task.json
├── tsconfig.json
├── package.json
├── .env.example           # Example environment file
└── README.md             # Usage documentation
```

### Configuration Management

#### Priority Order (first found wins):
1. Command line arguments
2. Environment variables
3. `.jirarc.json` in current directory
4. `.jirarc.json` in home directory
5. `jira` section in `package.json`

#### Required Configuration:
```javascript
{
  "host": "yourcompany.atlassian.net",
  "email": "user@example.com",
  "apiToken": "your-api-token",
  "project": "PROJ",
  "defaultIssueType": "Task",
  "board": "Engineering Board" // optional, for Agile commands
}
```

#### Environment Variables
- `JIRA_HOST` (e.g., `yourcompany.atlassian.net`)
- `JIRA_EMAIL`
- `JIRA_TOKEN`
- `JIRA_PROJECT`
- `JIRA_BOARD` (optional default for Agile commands)

#### Credentials Storage Policy
- Prefer system keychain via `keytar` to store/retrieve `JIRA_TOKEN` securely.
- Fallback to `.env` or interactive prompt if keychain is unavailable.
- Provide `jira auth set`/`jira auth test` helper subcommands for setup and validation.

### Security Considerations
1. **Never commit credentials** - use `.gitignore` for `.env` and `.jirarc.json`
2. **Use API tokens** - not passwords (Atlassian requirement)
3. **Validate inputs** - prevent injection attacks
4. **Audit logging** - log all mutations for traceability (redact tokens, accountIds)
5. **Read-only by default** - require flags for mutations
6. **Dry run** - `--dry-run` flag for create/update/comment to preview requests
7. **Secret redaction** - scrub tokens/headers from errors and debug logs

## Implementation Plan

### Phase 1: Foundation (2-3 hours)
1. **Setup Project Structure**
   - Create `/jira-cli` directory
   - Initialize npm package with TypeScript
   - Install core dependencies (`commander`, `got`, `dotenv`, `cosmiconfig`, `keytar`)
   - Setup ESLint and TS configs

2. **Configuration Module**
   - Implement config loader with priority chain and keychain integration
   - Add `.env.example` with required fields
   - Create validation for required fields
   - Add connection testing

3. **Basic CLI Skeleton**
   - Setup commander with subcommands
   - Add help text and version
   - Implement structured error handling
   - Add debug mode logging (redacted)
   - Add global flags: `--json`, `--quiet`, `--debug`

### Phase 2: Core Commands (3-4 hours)
1. **List Command**
   ```bash
   npm run jira list [options]
   ```
   - Options: `--status`, `--assignee`, `--sprint current|next|<name>`, `--limit`, `--page`, `--jql`
   - Output: Table with key, summary, status, assignee
   - Support JQL queries with `--jql`
   - Pagination via `maxResults` and `startAt`
   - `--json` output with stable schema

2. **View Command**
   ```bash
   npm run jira view <issueKey>
   ```
   - Show: Summary, description, status, comments
   - Options: `--comments`, `--history`, `--json`, `--adf`, `--open`
   - Support markdown output; raw ADF when `--adf`

3. **Create Command**
   ```bash
   npm run jira create [options]
   ```
   - Interactive mode by default
   - Template support with `--template` (variables via handlebars)
   - Options: `--type`, `--title`, `--description`, `--description-file`, `--priority`, `--labels`, `--components`
   - `--dry-run` to preview
   - Return created ticket key

### Phase 3: Advanced Commands (2-3 hours)
1. **Update Command**
   ```bash
   npm run jira update <issueKey> [options]
   ```
   - Options: `--status`, `--transition <name>`, `--assignee`, `--priority`, `--labels add:foo,bar remove:baz`
   - Support transitions with validation and suggestions
   - `--comment` for update reason (ADF body)
   - `--dry-run` to preview

2. **Comment Command**
   ```bash
   npm run jira comment <issueKey> <message>
   ```
   - Support multiline with `--file`
   - Add mentions with `--mention @email` (resolve to `accountId`)
   - Accept plain text; internally convert to ADF (code blocks, headings, links)
   - `--dry-run` to preview

3. **Sprint Command**
   ```bash
   npm run jira sprint [options]
   ```
   - List current sprint tickets (Agile API)
   - Show sprint progress
   - Support `--next` for next sprint, or `--name <sprint>`
   - Resolve board by `JIRA_BOARD` or `--board <name>`

4. **Additional Commands**
   - `attach <issueKey> <file>` - upload attachments
   - `link <from> <to> --type "relates to"` - create issue links
   - `watch <issueKey>` - watch/unwatch issues

### Phase 4: AI Assistant Features (COMPLETED)
1. **Batch Operations**
   ```bash
   npm run jira batch create <file>
   ```
   - Create multiple tickets from JSON or Markdown files
   - Interactive review mode with `--interactive`
   - Dry-run preview with `--dry-run`
   - Support for default labels and assignee
   - Output results to file with `--output`
   
   ```bash
   npm run jira batch parse <markdown-file>
   ```
   - Parse markdown files to extract potential issues
   - Recognizes TODOs, checkboxes, bug/feature markers
   - Extracts priorities, labels, and components
   - Preview in table or JSON format

2. **Context Generation**
   ```bash
   npm run jira context [options]
   ```
   - Generate markdown and JSON summaries for AI context
   - Include recent tickets
   - Add sprint overview and assignments

3. **Quick Actions**
   ```bash
   npm run jira quick <action>
   ```
   - quick:bug - Create bug from clipboard
   - quick:done - Move ticket to done
   - quick:todo - Create task and assign

### Global CLI Contract for AI
- Global flags: `--json`, `--quiet`, `--debug`, `--fields key,summary,status`, `--limit`, `--page`, `--jql`.
- JSON output schema (single object per invocation):
  ```json
  { "ok": true, "data": { }, "error": null }
  ```
  On failure:
  ```json
  { "ok": false, "data": null, "error": { "code": "AUTH" | "NOT_FOUND" | "RATE_LIMIT" | "INVALID_ARGS" | "NETWORK" | "UNKNOWN", "message": "...", "details": { } } }
  ```
- Exit codes: `0` ok, `2` invalid args, `3` auth, `4` not found, `5` rate limit, `6` network, `1` unknown error.
- When `--json` is set, suppress colors/spinners and print only the JSON object.

### Phase 5: Polish & Documentation (1-2 hours)
1. **Error Handling**
   - Graceful network failures
   - Clear error messages
   - Retry logic for transient failures
   - Offline mode for read operations

2. **Performance**
   - Cache ticket data (5 min TTL)
   - Batch API requests
   - Lazy load heavy fields
   - Progress indicators for long operations

3. **Documentation**
   - Comprehensive README
   - Example workflows
   - AI assistant integration guide
   - Troubleshooting guide

## Usage Examples

### For AI Assistants
```bash
# List current sprint tickets
npm run jira list -- --sprint current

# Create a bug ticket
npm run jira create -- --type Bug --title "FPS drops to 4" --description "After implementing..."

# Create a sub-task under a parent issue
npm run jira create -- --type Sub-task --summary "Implement validation logic" --parent CV-13

# Update ticket status
npm run jira update -- PROJ-123 --status "In Progress" --comment "Starting implementation"

# Parse markdown file for issues
npm run jira batch parse TODO.md --output issues.json

# Create issues from markdown with preview
npm run jira batch create TODO.md --dry-run

# Batch create with additional labels
npm run jira batch create tasks.json --labels "sprint-42,backend" --assignee "dev@example.com"

# Get context for current work
npm run jira context -- --sprint current --format markdown
```

JSON-friendly versions:
```bash
# List my tickets as JSON
npm run jira list -- --mine --limit 20 --json

# Create (dry run) from file description
npm run jira create -- --type Task --title "Refactor input system" --description-file ./desc.md --dry-run --json

# Comment with mention and code block
npm run jira comment -- PROJ-123 "See findings below" --mention @dev@example.com --json
```

### For Developers
```bash
# Interactive ticket creation
npm run jira create

# Quick bug report
echo "Bug description" | npm run jira quick:bug

# View ticket with comments
npm run jira view PROJ-123 --comments

# Bulk update from release
npm run jira batch release-1.0.json
```

### Markdown Format Example
```markdown
## Tasks for Sprint 42

### Backend
- [ ] Implement user authentication API #backend #security HIGH
- [ ] Add rate limiting to API endpoints #backend P1
- [ ] TODO: Optimize database queries for performance

### Frontend  
- [ ] BUG: Fix login form validation 🐛
- [ ] FEATURE: Add dark mode toggle ✨
- [ ] Update dashboard components [ui] [dashboard]

### Documentation
- [ ] Document API endpoints #documentation
- [ ] Create user guide for new features
```

The batch parser will extract:
- Checkboxes as tasks
- BUG/FEATURE markers for issue types
- Hashtags and [brackets] as labels
- Priority indicators (HIGH, P1, etc.)
- Section headers for context

## Testing Strategy

### Unit Tests
- Config loading with various sources
- Command argument parsing
- Output formatting
- Template validation

### Integration Tests
- Mock Jira API responses
- Test error scenarios
- Validate API token handling
- Test rate limiting
 - Agile endpoints (board/sprint resolution)

### Manual Testing Checklist
- [ ] Create ticket via interactive mode
- [ ] Create ticket via command line args
- [ ] List tickets with various filters
- [ ] Update ticket status through workflow
- [ ] Add comment with markdown
- [ ] Batch create from JSON file
- [ ] Generate context for AI
- [ ] Handle network timeout gracefully
 - [ ] Verify rate limit backoff and retry
 - [ ] Validate ADF comment rendering with mentions

## Success Metrics
1. **Functionality**: All core commands working
2. **Performance**: Commands complete in <2 seconds
3. **Reliability**: <1% failure rate for API calls
4. **Usability**: AI assistants can use without human intervention
5. **Security**: No credentials in logs or console output

## Rollout Plan
1. **Week 1**: Implement Phase 1-2, test with basic workflows
2. **Week 2**: Complete Phase 3-4, integrate with AI workflows
3. **Week 3**: Polish, document, and train team
4. **Week 4**: Monitor usage, gather feedback, iterate

## Maintenance Considerations
- Jira API version updates
- Rate limit monitoring
- Credential rotation reminders
- Usage analytics for optimization
- Regular dependency updates
 - Custom field mapping cache refresh policy
 - Board and sprint name→id cache invalidation strategy

## Alternative Approaches Considered
1. **GraphQL API**: More efficient but complex setup
2. **Browser automation**: Too fragile and slow
3. **Jira webhook integration**: Requires server infrastructure
4. **VS Code extension**: Limited to specific editor
5. **Python CLI**: Node.js already in project, better integration
6. **Direct REST via `got` vs `jira-client`**: Direct REST preferred for full v3 + Agile + ADF control; `jira-client` can be used selectively if needed

## Decision Log
- **2024-08-17**: Decided on commander over yargs for cleaner API
- **2024-08-17**: Opted for JSON config over YAML for consistency with package.json
- **2025-08-17**: Adopted TypeScript and direct REST API calls using `got` for full control over Jira Cloud v3 + Agile APIs, with ADF support
- **2025-08-17**: Implemented secure credential storage using keytar for system keychain integration
- **2025-08-17**: Standardized `--json` output contract and exit codes for AI assistant compatibility
- **2025-08-17**: Package named `@integratedpixel/jira-ai-cli` to align with AI-focused purpose

---

## Next Steps
1. Review and approve this strategy document
2. Create the `/jira-cli` directory structure
3. Confirm output contract and security policies (keychain, redaction, `--json`)
4. Implement Phase 1 (Foundation)
5. Test basic connectivity with your Jira instance
6. Iterate based on initial usage

Ready to begin implementation? Let's start with Phase 1!