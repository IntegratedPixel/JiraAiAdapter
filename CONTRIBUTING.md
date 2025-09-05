# Contributing to Jira AI CLI

Thank you for your interest in contributing to the Jira AI CLI! This guide will help you get started.

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- A Jira instance for testing
- Git

### Development Setup

1. **Clone and install dependencies:**
```bash
git clone https://github.com/IntegratedPixel/JiraAiAdapter.git
cd JiraAiAdapter
npm install
```

2. **Set up your development environment:**
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your Jira test instance details
# Never commit real credentials!
```

3. **Build and test:**
```bash
npm run build
npm run test
npm run lint
```

4. **Run in development mode:**
```bash
npm run dev -- list  # Run commands in development
npm run build:watch  # Auto-rebuild on changes
```

## Project Structure

```
src/
├── commands/         # CLI command implementations
├── clients/          # Jira API clients
├── config/           # Configuration management
├── types/            # TypeScript interfaces
└── utils/            # Utilities (formatters, loggers, etc.)

tests/
├── unit/             # Unit tests
└── integration/      # Integration tests
```

## Development Guidelines

### Code Style
- TypeScript with strict mode enabled
- Use ESLint configuration provided
- Follow existing naming conventions
- Write JSDoc comments for public methods

### Testing
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- --grep "ConfigManager"
```

### Adding New Commands

1. **Create command file:**
```typescript
// src/commands/mycommand.ts
import { Command } from 'commander';
import { ConfigManager } from '../config/jira.js';

export function createMyCommand(): Command {
  return new Command('mycommand')
    .description('My new command')
    .option('--project <key>', 'Project override')
    .option('--board <name>', 'Board override') 
    .action(async (options) => {
      // Implementation
    });
}
```

2. **Add to main index:**
```typescript
// src/index.ts
import { createMyCommand } from './commands/mycommand.js';
program.addCommand(createMyCommand());
```

3. **Add tests:**
```typescript
// tests/unit/commands/mycommand.test.ts
import { describe, it, expect } from 'vitest';
// Test implementation
```

### API Client Guidelines
- All Jira API calls go through CoreClient
- Use proper error handling with ErrorHandler
- Support project/board overrides consistently
- Add JSDoc documentation

### Environment Variables
All commands should support:
- `--project <key>` and `--board <name>` flags
- ConfigManager overrides: `getConfig({ project: options.project })`

## Submitting Changes

### Pull Request Process

1. **Create feature branch:**
```bash
git checkout -b feature/my-new-feature
```

2. **Make changes with tests:**
- Add/modify code
- Update tests  
- Update documentation
- Test thoroughly

3. **Commit with clear messages:**
```bash
git commit -m "feat: add sprint management command

- Add jira sprint list/add/remove commands
- Support for current/next sprint operations
- Multi-project sprint handling
- Comprehensive error messages"
```

4. **Push and create PR:**
```bash
git push origin feature/my-new-feature
# Create pull request on GitHub
```

### PR Requirements
- [ ] Tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`) 
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] No breaking changes (or clearly marked)

### Commit Message Format
Use conventional commits:
- `feat:` - New features
- `fix:` - Bug fixes  
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Build/tool changes

## Feature Requests

### Planned Features
See README.md "Coming Soon" section for planned features:
- Sprint management commands
- Issue attachment support
- Advanced AI assistant features

### Suggesting New Features
1. Check existing issues/discussions
2. Open GitHub issue with:
   - Use case description
   - Proposed API/command structure  
   - Example usage
   - Implementation considerations

## Bug Reports

### Before Reporting
1. Check if issue exists in latest version
2. Test with `--debug` flag for detailed output
3. Try with fresh configuration (`jira status`)

### Bug Report Template
```
**Environment:**
- OS: [macOS/Linux/Windows]
- Node version: [18.x]
- CLI version: [0.4.0]
- Jira instance: [Cloud/Server]

**Command:**
```bash
jira command --flags
```

**Expected vs Actual:**
[Description]

**Debug Output:**
```
[Output with --debug flag]
```
```

## Security

### Reporting Security Issues
- **DO NOT** create public issues for security problems
- Email security concerns to the maintainers
- Include detailed reproduction steps

### Security Guidelines
- Never commit real API tokens or credentials
- Use keychain storage for sensitive data
- Validate all user inputs
- Use environment variables for CI/CD secrets

## Questions?

- Check existing GitHub issues/discussions
- Review README.md and documentation
- Look at existing command implementations for examples

Thank you for contributing! 🚀