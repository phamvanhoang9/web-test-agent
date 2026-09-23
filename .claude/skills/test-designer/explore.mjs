#!/usr/bin/env node
// explore.mjs — black-box exploration driver for the test-designer skill (phase 1).
//
// Drives ANY public URL with headless Chromium and emits the evidence an
// agent needs to author test cases: a screenshot, console errors/warnings,
// the network request log (failures flagged), and an outline of the
// interactive elements (inputs, buttons, links) on the page.
//
// Usage:  node .claude/skills/test-designer/explore.mjs <url> [--steps steps.json]
//
// Output: artifacts/<host>/exploration.md   (the report an agent reads)
//         artifacts/<host>/screenshot.png   (full-page screenshot)
//         artifacts/<host>/console.json, network.json  (raw data)
//
// --steps lets you replay simple actions before capturing (to reach a page
// behind a click/fill), e.g. a JSON array:
//   [{"fill":"input[name=email]","value":"a@b.com"},{"click":"button:has-text('Sign in')"}]

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node explore.mjs <url> [--steps steps.json]');
  process.exit(1);
}
const stepsFlag = process.argv.indexOf('--steps');
const steps = stepsFlag !== -1
  ? JSON.parse(readFileSync(process.argv[stepsFlag + 1], 'utf8'))
  : [];

const host = new URL(url).host.replace(/[^a-z0-9.-]/gi, '_');
const outDir = `artifacts/${host}`;
mkdirSync(outDir, { recursive: true });

const console_msgs = [];
const network = [];

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') console_msgs.push({ type: t, text: m.text() });
});
page.on('pageerror', (e) => console_msgs.push({ type: 'pageerror', text: String(e) }));
page.on('response', (r) => {
  const s = r.status();
  network.push({ status: s, method: r.request().method(), url: r.url(), failed: s >= 400 });
});

let navStatus = null;
try {
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  navStatus = resp ? resp.status() : null;
} catch (e) {
  console_msgs.push({ type: 'nav-error', text: String(e) });
}

// Optional pre-capture actions to reach a deeper page.
for (const step of steps) {
  try {
    if (step.fill) await page.fill(step.fill, step.value ?? '');
    if (step.click) await page.click(step.click);
    if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 10000 });
    if (step.goto) await page.goto(step.goto, { waitUntil: 'networkidle' });
  } catch (e) {
    console_msgs.push({ type: 'step-error', text: `${JSON.stringify(step)} -> ${e}` });
  }
}

const finalUrl = page.url();
const title = await page.title();

await page.screenshot({ path: `${outDir}/screenshot.png`, fullPage: true });

// Outline interactive elements — the raw material for test cases.
const elements = await page.evaluate(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const grab = (sel, kind) =>
    [...document.querySelectorAll(sel)].filter(visible).map((el) => ({
      kind,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || el.getAttribute('id') || '',
      label:
        (el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.textContent ||
          '').trim().slice(0, 60),
      href: el.getAttribute('href') || '',
    }));
  return [
    ...grab('input, textarea, select', 'field'),
    ...grab('button, [role=button], input[type=submit]', 'button'),
    ...grab('a[href]', 'link'),
    ...grab('form', 'form'),
  ];
});

await browser.close();

// ---- Write the report ----
const fields = elements.filter((e) => e.kind === 'field');
const buttons = elements.filter((e) => e.kind === 'button');
const links = elements.filter((e) => e.kind === 'link');
const errors = console_msgs.filter((m) => m.type !== 'warning');
const failedReqs = network.filter((r) => r.failed);

const md = `# Exploration report — ${host}

- **Entered URL:** ${url}
- **Final URL:** ${finalUrl}${finalUrl !== url ? ' _(redirected)_' : ''}
- **HTTP status:** ${navStatus ?? 'n/a'}
- **Page title:** ${title}
- **Screenshot:** ./screenshot.png

## Health
- Console errors/page errors: **${errors.length}**
- Console warnings: **${console_msgs.filter((m) => m.type === 'warning').length}**
- Network requests: **${network.length}** (failed ≥400: **${failedReqs.length}**)

${errors.length ? '### Errors\n' + errors.map((e) => `- \`${e.type}\` ${e.text}`).join('\n') : '_No console/page errors._'}

${failedReqs.length ? '### Failed requests\n' + failedReqs.map((r) => `- ${r.status} ${r.method} ${r.url}`).join('\n') : '_No failed requests._'}

## Interactive surface (raw material for test cases)
### Fields (${fields.length})
${fields.map((f) => `- \`${f.tag}${f.type ? '[type=' + f.type + ']' : ''}\` name=\`${f.name}\` — ${f.label}`).join('\n') || '_none_'}

### Buttons (${buttons.length})
${buttons.map((b) => `- ${b.label || '(no text)'}`).join('\n') || '_none_'}

### Links (${links.length})
${links.slice(0, 30).map((l) => `- ${l.label || '(no text)'} → ${l.href}`).join('\n') || '_none_'}${links.length > 30 ? `\n- … and ${links.length - 30} more` : ''}
`;

writeFileSync(`${outDir}/exploration.md`, md);
writeFileSync(`${outDir}/console.json`, JSON.stringify(console_msgs, null, 2));
writeFileSync(`${outDir}/network.json`, JSON.stringify(network, null, 2));

console.log(`Explored ${url}`);
console.log(`  final: ${finalUrl} [${navStatus}] "${title}"`);
console.log(`  errors: ${errors.length}  failedReqs: ${failedReqs.length}`);
console.log(`  fields: ${fields.length}  buttons: ${buttons.length}  links: ${links.length}`);
console.log(`  report -> ${outDir}/exploration.md`);
