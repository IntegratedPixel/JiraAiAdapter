# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-02-01

### Added
- **Selftest Command** - End-to-end connectivity and CRUD verification
  - `jira selftest` runs a 5-step test: connect, create, search, update, delete
  - Creates a temporary `[SELFTEST]` issue and cleans it up automatically
  - Supports `--json` for structured output and `--yes` to skip confirmation
  - Exits with code 1 on any failure for CI/CD integration

### Changed
- **Search API Migration** - Migrated from deprecated `/rest/api/3/search` to `/rest/api/3/search/jql`
  - Replaced offset-based pagination (`startAt`/`--page`) with token-based pagination (`nextPageToken`/`--next-page-token`)
  - Default fields now request `*navigable` to match previous behavior
- **JiraSearchResult type** - Updated to reflect new API response shape (`nextPageToken` replaces `startAt`/`expand`)

## [0.5.0] - 2025-01-XX

### Added
- **Epic Link Support** - Link issues to Epics with `--epic` flag
  - Auto-detection of Epic Link field (standard `parent` or custom fields)
  - Works across both team-managed and company-managed projects
- **Enhanced Help Text** - Improved command descriptions and examples

## [0.4.0] - 2025-01-XX

### Added
- **Environment Variable Support** - Complete non-interactive setup via environment variables
  - `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_PROJECT` for core functionality
  - `JIRA_BOARD`, `JIRA_DEFAULT_TYPE`, `JIRA_DEFAULT_ASSIGNEE`, etc. for defaults
  - Enhanced `jira status` command shows configuration sources
- **Multi-Project Support** - Work across multiple projects in single session
  - `--project` and `--board` flags on all core commands
  - Perfect for Claude/AI workflows spanning microservices
- **Comment Command** - Add comments to issues with multiple input methods
  - Direct: `jira comment ISSUE-123 "message"`
  - File-based: `jira comment ISSUE-123 --file notes.md`
  - Interactive editor: `jira comment ISSUE-123`
- **Transition System** - Complete workflow transition support
  - Dedicated `jira transition` command with explicit control
  - Smart `jira update --status` with automatic transition discovery
  - List available transitions: `jira transition ISSUE-123 --list`
- **Story Points Support** - Full story points functionality
  - `--story-points` flag in create and update commands
  - Story points display in list and view commands
  - Auto-detection of custom fields across Jira instances
- **CSV Batch Import** - Import issues from CSV files
  - `jira batch create issues.csv` with flexible column mapping
  - `jira batch template` generates example CSV files
  - Support for all issue fields including story points
- **Enhanced Error Handling** - Better 400 error messages and field validation
  - Auto-retry for unavailable fields (priority, components, story points)
  - Detailed field-specific error messages
  - Debug mode shows full API responses

### Enhanced
- **Improved Interactive Setup** - Better detection of when to use interactive vs non-interactive modes
- **Robust Field Handling** - Automatic fallback for fields not available in specific Jira projects
- **Better Documentation** - Comprehensive README with environment variable examples and troubleshooting

### Fixed
- **Batch Create 400 Errors** - Resolved with improved field validation and auto-retry logic
- **Interactive Mode Issues** - Fixed unexpected prompts when command-line arguments provided
- **Story Points Field Detection** - Auto-discovery of custom fields across different Jira instances

## [0.3.0] - Previous Release

### Added
- Basic issue management (list, view, create, update, delete)
- JQL support for advanced queries
- Batch operations for JSON and Markdown files
- Multi-project configuration support
- ADF (Atlassian Document Format) support
- Issue types command

### Core Features
- Interactive and non-interactive modes
- Secure keychain credential storage
- JSON output mode for AI consumption
- Template system for common issue types
- Comprehensive error handling

---

## Publishing Notes

This changelog tracks the evolution of the Jira AI CLI from a basic tool to an enterprise-ready solution with full environment variable support, multi-project capabilities, and comprehensive workflow management.

Key milestones:
- **v0.3.x**: Core Jira operations established
- **v0.4.0**: Enterprise features, environment variables, transitions, comments, multi-project support
- **v0.5.0**: Epic Link support and enhanced help text
- **v0.6.0**: Selftest command, search API migration to `/search/jql` with token-based pagination