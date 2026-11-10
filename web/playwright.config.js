import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0, timeout: 20000, globalTimeout: 150000,
  outputDir: '../tmp/e2e-results', reporter: [['list']],
  use: { baseURL, headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined,
    viewport: { width: 1280, height: 900 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node ../scripts/e2e-server.cjs', url: `${baseURL}/health/ready`, reuseExistingServer: false, timeout: 60000 },
});
