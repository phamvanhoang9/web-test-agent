#!/usr/bin/env node
// gate.mjs — where a site stands in the four-step process: the state of gates G1–G4 and the
// next step. The agent runs it at the start of every session and every phase.
//
// Usage: node .claude/skills/web-test/gate.mjs <url>     (or BASE_URL=<url>)
// Exit 0 always, except 2 when no URL is given.

import { bundleDir, hostOf } from '../test-designer/lib/bundle.mjs';
import { gateStatus } from './lib/approval.mjs';

const url = process.argv[2] || process.env.BASE_URL;
if (!url) {
  console.error('Usage: node .claude/skills/web-test/gate.mjs <url>');
  process.exit(2);
}

const MISSING = {
  G1: 'bước 1 — requirement-analyst viết requirements.md.',
  G2: 'bước 2 — test-designer viết test-plan.md.',
  G3: 'bước 3 — sinh script, chạy test, rồi chạy report.mjs.',
  G4: 'bước 4 — result-analyst viết bug-report.md.',
};
const ICON = { approved: '✅', pending: '⬜', stale: '⚠️', missing: '—' };

function detail(status) {
  if (status.state === 'approved') return `${status.by} · ${status.at}`;
  if (status.state === 'missing') return 'chưa có';
  if (status.state === 'stale') return `chưa qua: ${status.reason}`;
  const extra = [status.reason, status.unclassified?.length ? `${status.unclassified.length} TC fail chưa phân loại` : null];
  return ['chờ duyệt', ...extra.filter(Boolean)].join(' · ');
}

function nextStep(status) {
  if (!status) return 'mọi cổng đã qua — chạy bugs.mjs để xuất bugs.csv nếu chưa xuất.';
  if (status.unclassified?.length) return `chạy self-healer cho ${status.unclassified.join(', ')}.`;
  if (status.state === 'missing') return MISSING[status.gate];
  if (status.state === 'pending') return `Tester review và duyệt ${status.file}.`;
  return `Tester review lại ${status.file} (${status.reason}).`;
}

const statuses = gateStatus(bundleDir(url));
console.log(`Cổng duyệt — ${hostOf(url)}`);
for (const status of statuses) {
  console.log(`  ${status.gate} ${status.file.padEnd(18)} ${ICON[status.state]} ${detail(status)}`);
}
console.log(`Bước tiếp: ${nextStep(statuses.find((s) => s.state !== 'approved'))}`);
