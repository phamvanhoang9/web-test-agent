// approval.mjs — the tester's approval gates G1–G4, one per step of the process.
//
// Each gated file carries one line under its title, written by the tester (or by the agent
// after the tester says "duyệt" in chat):
//   > **Duyệt:** ⬜ Chờ duyệt
//   > **Duyệt:** ✅ Đã duyệt — <name> — YYYY-MM-DD HH:mm
// A gate passes when its file is approved, the previous gate passes, and it was approved no
// earlier than the previous gate. G3 also needs every failed TC of the latest run named in a
// heal-proposal.md written after that run. Scripts that must not run before a gate call
// requireGate / requireGatesOrExit; exit code 3 means "blocked by a gate" everywhere.

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { readSnapshots } from '../../test-runner/lib/history.mjs';

const GATES = [
  { gate: 'G1', file: 'requirements.md' },
  { gate: 'G2', file: 'test-plan.md' },
  { gate: 'G3', file: 'quality-gate.md' },
  { gate: 'G4', file: 'bug-report.md' },
];

export const PENDING_LINE = '> **Duyệt:** ⬜ Chờ duyệt';
const LINE = /^> \*\*Duyệt:\*\*.*$/mu;
const APPROVED = /^> \*\*Duyệt:\*\*\s*(?:✅\s*)?Đã duyệt\s*[—-]\s*(.+?)\s*[—-]\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*$/mu;

/** `{ approved, by, at }` from the approval line; `malformed` when it claims approval but cannot be read. */
export function parseApproval(md) {
  const text = md.normalize('NFC');
  const match = APPROVED.exec(text);
  if (match) return { approved: true, by: match[1], at: match[2] };
  return { approved: false, malformed: /Đã duyệt/u.test(LINE.exec(text)?.[0] ?? '') };
}

/** Failed TCs of the latest run that the current heal-proposal.md does not name. */
export function unclassifiedFailures(dir) {
  const latest = readSnapshots(dir).snapshots.at(-1);
  if (!latest) return [];
  const failed = latest.cases.filter((c) => c.status === 'failed').map((c) => c.tc);
  if (!failed.length) return [];
  const heal = path.join(dir, 'heal-proposal.md');
  const current = existsSync(heal) && statSync(heal).mtime >= new Date(latest.startedAt);
  const text = current ? readFileSync(heal, 'utf8') : '';
  return failed.filter((tc) => !new RegExp(`\\b${tc}\\b`).test(text));
}

/** The state of every gate, in order. */
export function gateStatus(dir) {
  const statuses = [];
  let previous = null;
  for (const { gate, file } of GATES) {
    const full = path.join(dir, file);
    const status = { gate, file };
    if (!existsSync(full)) {
      status.state = 'missing';
    } else {
      const approval = parseApproval(readFileSync(full, 'utf8'));
      const unclassified = gate === 'G3' ? unclassifiedFailures(dir) : [];
      if (gate === 'G3') status.unclassified = unclassified;
      if (!approval.approved) {
        status.state = 'pending';
        if (approval.malformed) status.reason = `${file}: dòng duyệt sai định dạng (cần "— <tên> — YYYY-MM-DD HH:mm")`;
      } else {
        Object.assign(status, { by: approval.by, at: approval.at });
        if (previous && previous.state !== 'approved') {
          Object.assign(status, { state: 'stale', reason: `${previous.gate} chưa qua` });
        } else if (previous && approval.at < previous.at) {
          Object.assign(status, {
            state: 'stale',
            reason: `${file} được duyệt lúc ${approval.at}, trước khi ${previous.file} được duyệt lúc ${previous.at}`,
          });
        } else if (unclassified.length) {
          Object.assign(status, {
            state: 'stale',
            reason: `${unclassified.length} TC fail chưa phân loại (${unclassified.join(', ')})`,
          });
        } else {
          status.state = 'approved';
        }
      }
    }
    statuses.push(status);
    previous = status;
  }
  return statuses;
}

export class GateError extends Error {}

const STATE_TEXT = { missing: 'chưa có file', pending: 'chờ duyệt' };

/** The gate's status when it has passed; a GateError naming what blocks it otherwise. */
export function requireGate(dir, gate) {
  const status = gateStatus(dir).find((s) => s.gate === gate);
  if (status.state === 'approved') return status;
  const why = status.reason ?? `${status.file} ${STATE_TEXT[status.state]}`;
  throw new GateError(`${gate} chưa qua: ${why}. Tester cần review và duyệt ${status.file} trước khi đi tiếp.`);
}

/** CLI helper: print why a gate blocks and exit 3. */
export function requireGatesOrExit(dir, ...gates) {
  try {
    for (const gate of gates) requireGate(dir, gate);
  } catch (error) {
    if (!(error instanceof GateError)) throw error;
    console.error(error.message);
    process.exit(3);
  }
}
