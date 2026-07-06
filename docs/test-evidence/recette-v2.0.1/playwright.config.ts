import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'results.json' }]],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    locale: 'fr-FR',
    timezoneId: 'Pacific/Noumea',
  },
  outputDir: '/tmp/alvm-recette-artifacts',
});
