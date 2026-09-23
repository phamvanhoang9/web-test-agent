#!/usr/bin/env node
// report.mjs — merge Playwright + chrome-devtools-MCP results into a BMAD-style
// traceability matrix + quality-gate decision (PASS / CONCERNS / BLOCKED / FAIL), and
// print a human summary the runner relays back to the user.
//
// Host (per-domain bundle) is derived from BASE_URL, or passed as argv[2].
// Reads (whichever exist):
//   artifacts/<host>/results.json       (Playwright `json` reporter — Tool=PW cases)
//   artifacts/<host>/mcp-results.json    (agent-written — Tool=MCP cases)
//     shape: [{ tc, prio, status:'passed'|'failed'|'skipped', title, durationMs?, note? }]
//       status 'skipped' = the case could NOT be verified (tool/environment limit, or a
//         missing precondition). It is neither a pass nor a fail, and is excluded from
//         every pass-rate denominator.
//       note (optional string) = why it was skipped, or evidence behind a verdict. A
//         skipped record should always carry one; it is printed in the gate report.
// Writes:
//   artifacts/<host>/quality-gate.md
//
// Priority from a [P0]..[P3] tag in the title (or the `prio` field for MCP);
// TC id from a TC-\d+ token (or the `tc` field). Gate thresholds (BMAD):
//   P0 pass rate must be 100% → FAIL otherwise; P1 ≥95% → CONCERNS otherwise;
//   P2/P3 failures informational. A P0 case that was skipped (unverified, not broken)
//   yields BLOCKED, not FAIL. Exit code: FAIL → 1, BLOCKED → 2, otherwise 0.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const base = process.env.BASE_URL;
// Sanitize identically to test-designer/explore.mjs so ported hosts (localhost:3000)
// resolve to the same artifacts/<host>/ folder the designer/runner wrote to.
const rawHost = process.argv[2] || process.env.WEBTEST_HOST || (base ? new URL(base).host : '');
const host = (rawHost || '').replace(/[^a-z0-9.-]/gi, '_');
if (!host) {
  console.error('No host. Set BASE_URL=<url> (or pass the host as the first arg) so I know which artifacts/<host>/ to read.');
  process.exit(1);
}
const dir = path.join('artifacts', host);
const pwPath = path.join(dir, 'results.json');
const mcpPath = path.join(dir, 'mcp-results.json');
const OUT = path.join(dir, 'quality-gate.md');

const prioOf = (t) => t.match(/\[(P[0-3])\]/)?.[1] || 'P1';
const tcOf = (t) => t.match(/\b(TC-\d+)\b/)?.[1] || '—';
const cleanTitle = (t) => t.replace(/\[P[0-3]\]\s*/, '').replace(/^TC-\d+\s*/, '');

const rows = [];

// ---- Playwright results ----
if (existsSync(pwPath)) {
  const data = JSON.parse(readFileSync(pwPath, 'utf8'));
  const walk = (suite, file) => {
    const f = suite.file || file;
    for (const s of suite.specs || []) {
      const result = s.tests?.[0]?.results?.at(-1);
      // test.skip()/test.fixme() leaves spec.ok === true — an unrun case is not a pass.
      const skipped = result?.status === 'skipped';
      rows.push({
        tool: 'PW',
        title: s.title,
        ok: s.ok === true && !skipped,
        skipped,
        note: '',
        duration: result?.duration ?? 0,
        loc: `${(f || '').split('/').pop()}:${s.line ?? ''}`,
        prio: prioOf(s.title),
        tc: tcOf(s.title),
      });
    }
    for (const child of suite.suites || []) walk(child, f);
  };
  for (const suite of data.suites || []) walk(suite);
}

// ---- chrome-devtools-MCP results (agent-written) ----
if (existsSync(mcpPath)) {
  const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
  for (const r of Array.isArray(mcp) ? mcp : []) {
    const title = r.title || '';
    const skipped = r.status === 'skipped' || r.status === 'skip';
    rows.push({
      tool: 'MCP',
      title,
      ok: !skipped && (r.status === 'passed' || r.status === 'pass' || r.ok === true),
      skipped,
      note: r.note || '',
      duration: r.durationMs ?? 0,
      loc: 'chrome-devtools-mcp',
      prio: r.prio || prioOf(title),
      tc: r.tc || tcOf(title),
    });
  }
}

if (!rows.length) {
  console.error(`No results found in ${dir} (need results.json and/or mcp-results.json). Run the tests first.`);
  process.exit(1);
}

const by = (p) => rows.filter((r) => r.prio === p);
const passN = (arr) => arr.filter((r) => r.ok).length;
const failN = (arr) => arr.filter((r) => !r.ok && !r.skipped).length;
const skipN = (arr) => arr.filter((r) => r.skipped).length;
// Skipped cases leave the denominator entirely: a case we could not verify is evidence
// for nothing. `null` = nothing was actually executed at that priority.
const rate = (arr) => {
  const executed = arr.length - skipN(arr);
  return executed ? Math.round((passN(arr) / executed) * 100) : null;
};
const fmtRate = (arr) => (rate(arr) === null ? '—' : `${rate(arr)}%`);

const P0 = by('P0'), P1 = by('P1'), P2 = by('P2'), P3 = by('P3');
const total = rows.length, passed = passN(rows), failed = failN(rows), skipped = skipN(rows);
const fails = rows.filter((r) => !r.ok && !r.skipped);
const skips = rows.filter((r) => r.skipped);

// ---- Gate decision ----
// FAIL > BLOCKED > CONCERNS > PASS. BLOCKED means "not verified", never "broken".
let decision, icon, rationale;
if (failN(P0)) {
  decision = 'FAIL'; icon = '❌';
  rationale = `${failN(P0)} P0 (critical) test(s) failed. P0 must be 100%. Block release until fixed.`;
} else if (skipN(P0)) {
  decision = 'BLOCKED'; icon = '⛔';
  rationale = `${skipN(P0)} P0 (critical) case(s) could not be verified — a tool or environment limitation, not an application defect. Every P0 case that did run passed. Re-run the unverified cases by another method (real device, manual QA) before release; this is not a P0 failure.`;
} else if (rate(P1) !== null && rate(P1) < 95) {
  decision = 'CONCERNS'; icon = '⚠️';
  rationale = `All P0 pass, but P1 pass rate ${rate(P1)}% is below the 95% threshold. Deploy only with enhanced monitoring + a remediation backlog.`;
} else if (failed > 0) {
  decision = 'CONCERNS'; icon = '⚠️';
  rationale = `All P0/P1 thresholds met, but ${failed} lower-priority (P2/P3) test(s) failed. Informational — track, do not block.`;
} else if (skipped > 0) {
  decision = 'CONCERNS'; icon = '⚠️';
  rationale = `Every executed test passed, but ${skipped} non-P0 case(s) could not be verified. Coverage is incomplete — re-run them by another method before calling this a clean run.`;
} else {
  decision = 'PASS'; icon = '✅';
  rationale = `All ${total} tests passed across every priority. No blocking issues. Ready to proceed.`;
}

const verdict = (r) => (r.skipped ? '⏭️ SKIP' : r.ok ? '✅ pass' : '❌ FAIL');
const traceRows = rows
  .sort((a, b) => a.prio.localeCompare(b.prio) || a.tc.localeCompare(b.tc))
  .map((r) => `| ${r.tc} | ${r.prio} | ${r.tool} | ${verdict(r)} | ${(r.duration / 1000).toFixed(1)}s | \`${r.loc}\` | ${cleanTitle(r.title)} |`)
  .join('\n');

const bullet = (r) => `- **${r.tc} [${r.prio}] (${r.tool})** ${cleanTitle(r.title)}${r.note ? `\n  - ${r.note}` : ''}`;
const failSection = failed
  ? '## Failures\n\n' + fails.map((r) => `${bullet(r)}\n  - \`${r.loc}\``).join('\n')
  : '_No failures._';
const skipSection = skipped
  ? '\n\n## Not verified (skipped)\n\n_Excluded from every pass rate. These are open questions, not results — '
    + 're-run them by another method before treating the run as complete._\n\n'
    + skips.map(bullet).join('\n')
  : '';

const md = `# Quality Gate — ${decision} ${icon} — ${host}

> Generated by the web-test runner from \`${dir}/\` (Playwright + chrome-devtools-MCP).

## Decision: ${decision} ${icon}

${rationale}

## Execution summary

Pass rate = passed / (total − skipped). A skipped case never executed, so it counts
neither as a pass nor as a failure.

| Priority | Total | Passed | Failed | Skipped | Pass rate | Threshold | Status |
|---|---|---|---|---|---|---|---|
| P0 (critical) | ${P0.length} | ${passN(P0)} | ${failN(P0)} | ${skipN(P0)} | ${fmtRate(P0)} | 100% | ${failN(P0) ? '❌' : skipN(P0) ? '⏭️' : '✅'} |
| P1 (high) | ${P1.length} | ${passN(P1)} | ${failN(P1)} | ${skipN(P1)} | ${fmtRate(P1)} | ≥95% | ${rate(P1) !== null && rate(P1) < 95 ? '⚠️' : skipN(P1) ? '⏭️' : '✅'} |
| P2 (medium) | ${P2.length} | ${passN(P2)} | ${failN(P2)} | ${skipN(P2)} | ${fmtRate(P2)} | informational | ${failN(P2) ? 'ℹ️' : skipN(P2) ? '⏭️' : '✅'} |
| P3 (low) | ${P3.length} | ${passN(P3)} | ${failN(P3)} | ${skipN(P3)} | ${fmtRate(P3)} | informational | ${failN(P3) ? 'ℹ️' : skipN(P3) ? '⏭️' : '✅'} |
| **Total** | **${total}** | **${passed}** | **${failed}** | **${skipped}** | **${fmtRate(rows)}** | — | ${failed ? '⚠️' : skipped ? '⏭️' : '✅'} |

## Traceability (test case → result)

| TC | Prio | Tool | Result | Time | Location | Title |
|---|---|---|---|---|---|---|
${traceRows}

${failSection}${skipSection}

## Gate (CI snippet)

\`\`\`yaml
quality_gate:
  host: ${host}
  decision: ${decision}
  totals: { total: ${total}, passed: ${passed}, failed: ${failed}, skipped: ${skipped} }
  pass_rate: { p0: ${rate(P0) ?? 'null'}, p1: ${rate(P1) ?? 'null'}, p2: ${rate(P2) ?? 'null'}, p3: ${rate(P3) ?? 'null'}, overall: ${rate(rows) ?? 'null'} }
  thresholds: { p0: 100, p1: 95 }
  # pass_rate excludes skipped cases; null = nothing executed at that priority.
\`\`\`
`;

writeFileSync(OUT, md);

// ---- Human summary (the runner relays this back to the user) ----
console.log(`\n══ GATE: ${decision} ${icon} — ${host} ══`);
console.log(`Test cases: ${passed}/${total} passed (${failed} failed, ${skipped} skipped)  ·  P0 ${fmtRate(P0)} · P1 ${fmtRate(P1)} · P2 ${fmtRate(P2)} · P3 ${fmtRate(P3)}`);
if (fails.length) {
  console.log('Failed:');
  for (const r of fails) console.log(`  ❌ ${r.tc} [${r.prio}] (${r.tool}) ${cleanTitle(r.title)}  @ ${r.loc}`);
}
if (skips.length) {
  console.log('Skipped — not verified, excluded from pass rates:');
  for (const r of skips) console.log(`  ⏭️ ${r.tc} [${r.prio}] (${r.tool}) ${cleanTitle(r.title)}${r.note ? ` — ${r.note}` : ''}`);
}
console.log(`Report : ${OUT}`);
console.log(`HTML   : npx playwright show-report ${path.join(dir, 'html-report')}`);
// Non-zero exit so CI / the orchestrator can block: 1 = real failure, 2 = unverified.
process.exit(decision === 'FAIL' ? 1 : decision === 'BLOCKED' ? 2 : 0);
