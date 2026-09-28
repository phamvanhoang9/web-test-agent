import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'report.mjs');
const RUN_START = new Date('2026-09-27T09:00:00Z');
const BEFORE = new Date('2026-09-26T08:00:00Z');
const AFTER = new Date('2026-09-27T09:30:00Z');

const spec = (title, status) => ({
  title, ok: status !== 'failed', line: 1,
  tests: [{ results: [{ status, duration: 10 }] }],
});

const PLAN = `# Test plan — app.test

> Status: ⬜ chưa chạy · ✅ pass · ❌ fail · ⏭️ skip

| TC | P | Tool | Mô tả | Các bước | Kỳ vọng | Status |
|------|----|------|----|----|----|--------|
| TC-001 | P0 | PW | Login | 1. Mở /login | Vào | ✅ |
| TC-002 | P2 | PW | Header | 1. GET / | Có header | ✅ |
| TC-003 | P1 | MCP | Live | 1. Start | Chạy | ❌ |
| TC-004 | P3 | PW | Mới thêm | 1. Mở / | Có | ✅ |
`;

/** A bundle with a Playwright run that started at RUN_START, and MCP results written at `mcpTime`. */
function bundle({ mcpTime = AFTER, plan = PLAN, heal = null } = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'webtest-report-'));
  const dir = path.join(cwd, 'artifacts', 'app.test');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'results.json'), JSON.stringify({
    stats: { startTime: RUN_START.toISOString() },
    suites: [{ file: 'a.spec.mjs', specs: [spec('TC-001 [P0] login', 'passed'), spec('TC-002 [P2] headers', 'failed')] }],
  }));
  const mcp = path.join(dir, 'mcp-results.json');
  writeFileSync(mcp, JSON.stringify([{ tc: 'TC-003', prio: 'P1', status: 'passed', title: 'Live' }]));
  utimesSync(mcp, mcpTime, mcpTime);
  if (plan) writeFileSync(path.join(dir, 'test-plan.md'), plan);
  if (heal) {
    const file = path.join(dir, 'heal-proposal.md');
    writeFileSync(file, '# old proposal\n');
    utimesSync(file, heal, heal);
  }
  return { cwd, dir };
}

function runReport(cwd) {
  const env = { ...process.env };
  delete env.BASE_URL;
  delete env.WEBTEST_HOST;
  return new Promise((resolve) => {
    execFile(process.execPath, [REPORT, 'app.test'], { cwd, env },
      (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }));
  });
}

test('MCP results written after the Playwright run count as results', async () => {
  const { cwd, dir } = bundle({ mcpTime: AFTER });
  const { stdout } = await runReport(cwd);
  assert.match(stdout, /2\/3 passed \(1 failed, 0 skipped\)/);
  assert.ok(!readFileSync(path.join(dir, 'quality-gate.md'), 'utf8').includes('older than this run'));
});

test('MCP results older than the Playwright run are treated as not verified', async () => {
  const { cwd, dir } = bundle({ mcpTime: BEFORE });
  const { stdout } = await runReport(cwd);
  assert.match(stdout, /1\/3 passed \(1 failed, 1 skipped\)/);
  assert.match(stdout, /mcp-results\.json is older than this run/);
  const gate = readFileSync(path.join(dir, 'quality-gate.md'), 'utf8');
  assert.match(gate, /TC-003 \[P1\] \(MCP\)[^\n]*\n\s+- .*older than this run/);
});

test('the plan Status column is rewritten from this run; unrun cases go back to ⬜', async () => {
  const { cwd, dir } = bundle();
  await runReport(cwd);
  const plan = readFileSync(path.join(dir, 'test-plan.md'), 'utf8');
  const status = (tc) => new RegExp(`^\\| ${tc} \\|.*\\| (\\S+) \\|$`, 'm').exec(plan)?.[1];
  assert.deepEqual(['TC-001', 'TC-002', 'TC-003', 'TC-004'].map(status), ['✅', '❌', '✅', '⬜']);
  assert.ok(plan.includes('> Status: ⬜ chưa chạy · ✅ pass · ❌ fail · ⏭️ skip'), 'the legend line is left alone');
  assert.ok(plan.includes('| TC-002 | P2 | PW | Header | 1. GET / | Có header |'), 'other cells are left alone');
});

test('a stale MCP result shows as ⏭️ in the plan', async () => {
  const { cwd, dir } = bundle({ mcpTime: BEFORE });
  await runReport(cwd);
  assert.match(readFileSync(path.join(dir, 'test-plan.md'), 'utf8'), /^\| TC-003 \|.*\| ⏭️ \|$/m);
});

test('CRLF plans keep their line endings', async () => {
  const { cwd, dir } = bundle({ plan: PLAN.replaceAll('\n', '\r\n') });
  await runReport(cwd);
  const plan = readFileSync(path.join(dir, 'test-plan.md'), 'utf8');
  assert.match(plan, /^\| TC-002 \|.*\| ❌ \|\r$/m);
  assert.equal(plan.split('\r\n').length, PLAN.split('\n').length);
});

test('a heal proposal from before this run is archived under its date', async () => {
  const { cwd, dir } = bundle({ heal: BEFORE });
  await runReport(cwd);
  assert.equal(existsSync(path.join(dir, 'heal-proposal.md')), false);
  const archived = readdirSync(dir).filter((f) => /^heal-proposal\.\d{4}-\d{2}-\d{2}-\d{4}\.md$/.test(f));
  assert.equal(archived.length, 1);
  assert.equal(readFileSync(path.join(dir, archived[0]), 'utf8'), '# old proposal\n');
});

test('a heal proposal written after this run is kept', async () => {
  const { cwd, dir } = bundle({ heal: AFTER });
  await runReport(cwd);
  assert.equal(existsSync(path.join(dir, 'heal-proposal.md')), true);
});

test('without a plan the report still works', async () => {
  const { cwd, dir } = bundle({ plan: null });
  const { code } = await runReport(cwd);
  assert.equal(code, 0);
  assert.equal(existsSync(path.join(dir, 'test-plan.md')), false);
});
