import { defineConfig } from '@playwright/test';

const executablePath = process.env.OWL_BROWSER_PATH;

export default defineConfig({
  testDir: './test/ui',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:8765',
    viewport: { width: 1000, height: 1100 },
    launchOptions: executablePath ? { executablePath } : {}
  },
  webServer: {
    command: 'python3 scripts/preview.py',
    url: 'http://127.0.0.1:8765/options.html',
    reuseExistingServer: false
  }
});
