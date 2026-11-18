import { defineConfig } from '@playwright/test'

const perf = process.env.AD_SHIELD_PERF === '1'
const port = perf ? 4174 : 4173
const config = perf ? ' --config vite.perf.config.ts' : ''
const output = perf ? ' --outDir dist-perf' : ''
const build = perf ? 'npm run build:perf' : 'npm run build'
const readyPath = perf ? '/perf.html' : '/'

export default defineConfig({
  testDir: './e2e',
  testMatch: perf ? '**/perf.spec.ts' : '**/*.spec.ts',
  testIgnore: perf ? [] : '**/perf.spec.ts',
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', headless: true },
  webServer: {
    command: `${build} && vite preview${config}${output} --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}${readyPath}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
