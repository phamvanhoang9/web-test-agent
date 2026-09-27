#!/usr/bin/env node
// coverage.mjs — check that test-plan.md accounts for everything exploration found.
//
// Usage: node .claude/skills/test-designer/coverage.mjs <url>
//
// Reads artifacts/<host>/test-plan.md, artifacts/<host>/exploration.md (explore.mjs) and
// artifacts/<host>/crawl/site-map.json + crawl/pages/*/exploration.md (crawl.mjs). Every
// route and every labelled field, button and link must appear in a TC row of the plan, or
// in its "không test (và lý do)" section.
// Output: artifacts/<host>/coverage.md. Exit 0 = no gaps, 1 = gaps, 2 = nothing to check.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bundleDir, hostOf } from './lib/bundle.mjs';
import { checkCoverage, parseOutline, parsePlan, renderCoverage } from './lib/coverage.mjs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node .claude/skills/test-designer/coverage.mjs <url>');
  process.exit(2);
}
const dir = bundleDir(url);
const read = (...parts) => {
  const file = path.join(dir, ...parts);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

const plan = read('test-plan.md');
if (plan === null) {
  console.error(`No plan at ${path.join(dir, 'test-plan.md')} — write the test plan first.`);
  process.exit(2);
}

const routes = [];
const outlines = [];
const explored = read('exploration.md');
if (explored !== null) {
  const outline = parseOutline(explored);
  outlines.push(outline);
  if (outline.page) routes.push(outline.page);
}
const siteMapJson = read('crawl', 'site-map.json');
if (siteMapJson !== null) {
  const siteMap = JSON.parse(siteMapJson);
  for (const template of siteMap.templates) {
    routes.push(template.template);
    const evidence = template.evidence && read('crawl', template.evidence);
    if (evidence) outlines.push(parseOutline(evidence));
  }
  routes.push(...(siteMap.bundleRoutes?.routes ?? []).map((r) => r.route));
}
if (!outlines.length && !routes.length) {
  console.error(`Nothing explored in ${dir} — run explore.mjs or crawl.mjs first.`);
  process.exit(2);
}

const result = checkCoverage({ routes, outlines, plan: parsePlan(plan), origin: new URL(url).origin });
const report = path.join(dir, 'coverage.md');
writeFileSync(report, renderCoverage(result, hostOf(url)));

const covered = (items) => `${items.filter((i) => i.covered).length}/${items.length}`;
console.log(`Coverage ${hostOf(url)}: routes ${covered(result.routes)}, controls ${covered(result.controls)}, ${result.gaps.length} gap(s)`);
for (const gap of result.gaps) console.log(`  - ${gap.route ?? `${gap.kind} "${gap.label}" (${gap.pages.join(', ')})`}`);
console.log(`  report -> ${report}`);
process.exit(result.gaps.length ? 1 : 0);
