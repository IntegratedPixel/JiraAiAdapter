import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Different timeouts for different test types
    testTimeout: 30000,  // 30s for integration tests
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '*.config.ts',
        '**/*.d.ts',
        'tests/**',
        'src/templates/**',
        'src/index.ts',  // CLI entry point
        'examples/**',
      ],
    },
    // Test environment configuration
    env: {
      NODE_ENV: 'test',
      JIRA_SUBTASK_TYPE: 'Subtask',  // Configurable subtask type
    },
  },
});