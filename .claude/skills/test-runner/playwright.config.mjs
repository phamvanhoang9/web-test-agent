// Playwright config for the web-test workflow (test-runner skill).
// Everything for a target site lives under artifacts/<host>/ — specs, reports,
// results. The host is derived from BASE_URL so one run = one domain bundle:
//   BASE_URL=https://brse.ai npx playwright test --config .claude/skills/test-runner/playwright.config.mjs
//   → testDir artifacts/brse.ai/tests, outputs artifacts/brse.ai/{html-report,results.json,test-results}
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const root = process.cwd(); // the project being tested
const base = process.env.BASE_URL;
// host drives the per-domain artifact bundle; override with WEBTEST_HOST if needed.
// Sanitize identically to test-designer/explore.mjs so ported hosts (localhost:3000)
// map to the SAME folder both write/read (e.g. localhost_3000).
const rawHost = process.env.WEBTEST_HOST || (base ? new URL(base).host : '');
const host = rawHost.replace(/[^a-z0-9.-]/gi, '_');
const outDir = path.join(root, 'artifacts', host); // host '' → artifacts/ (no specs found)

export default defineConfig({
  testDir: path.join(outDir, 'tests'),
  outputDir: path.join(outDir, 'test-results'),
  fullyParallel: true,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(outDir, 'html-report'), open: 'never' }],
    ['json', { outputFile: path.join(outDir, 'results.json') }], // consumed by report.mjs
  ],
  use: {
    baseURL: base, // set per run
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Uncomment for cross-browser / mobile coverage:
    // { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
    // { name: 'mobile',   use: { ...devices['Pixel 7'] } },
  ],
});
