import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLinkCommand } from '../../../src/commands/link.js';
import { CoreClient } from '../../../src/clients/core.js';

// Mock the CoreClient
vi.mock('../../../src/clients/core.js');

describe('Link Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a link command with proper structure', () => {
    const command = createLinkCommand();
    
    expect(command.name()).toBe('link');
    expect(command.description()).toBe('Create, list, or delete issue links');
    
    // Check subcommands
    const subcommands = command.commands.map(cmd => cmd.name());
    expect(subcommands).toContain('create');
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('delete');
    expect(subcommands).toContain('types');
  });

  it('should have correct aliases for subcommands', () => {
    const command = createLinkCommand();
    
    const createCommand = command.commands.find(cmd => cmd.name() === 'create');
    expect(createCommand?.aliases).toContain('add');
    
    const listCommand = command.commands.find(cmd => cmd.name() === 'list');
    expect(listCommand?.aliases).toContain('ls');
    
    const deleteCommand = command.commands.find(cmd => cmd.name() === 'delete');
    expect(deleteCommand?.aliases).toContain('remove');
    expect(deleteCommand?.aliases).toContain('rm');
  });

  it('should have proper options', () => {
    const command = createLinkCommand();
    
    const options = command.options.map(opt => opt.long);
    expect(options).toContain('--project');
    expect(options).toContain('--board');
    
    // Check create command options
    const createCommand = command.commands.find(cmd => cmd.name() === 'create');
    const createOptions = createCommand?.options.map(opt => opt.long);
    expect(createOptions).toContain('--type');
    expect(createOptions).toContain('--comment');
  });
});