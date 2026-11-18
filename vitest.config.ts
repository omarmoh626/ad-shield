import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
    environment: 'node',
    // Component tests under tests/ui start with: // @vitest-environment jsdom
    setupFiles: ['./tests/setup.ts'],
  },
})
