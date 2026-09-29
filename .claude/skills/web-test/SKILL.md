---
name: web-test
description: E2E web-testing orchestrator for a tester's full process — requirement analysis, test design, execution, result analysis — each ending at a tester approval gate. Use when asked to test/QA a web app end-to-end, or to run the whole process. Sequences requirement-analyst → test-designer → script-generator → test-runner → self-healer → result-analyst.
---

End-to-end black-box web testing for this project, following a tester's process. This skill is
the **orchestrator**: it sequences six focused sub-skills through four steps, each ending at a
gate the tester approves. No source code of the target needed.

Everything for a target site is grouped under `artifacts/<host>/` (host derived
from the URL, e.g. `artifacts/brse.ai/`). Run commands from the project root.

## The four steps

| Step | Sub-skill | Does | Tester approves | Gate | Blocks until it passes |
|---|---|---|---|---|---|
| 1 REQUIREMENTS | **requirement-analyst** | read the documents in `requirements/`, explore the site, infer what no document covers → testable REQs, flows, open questions | `requirements.md` | G1 | `coverage.mjs` |
| 2 DESIGN | **test-designer** | risk-based plan: a TC table linked to REQs; picks PW vs MCP per case | `test-plan.md` | G2 | `npm test`, `report.mjs`, MCP cases |
| 3 EXECUTE | **script-generator**, **test-runner**, **self-healer** | specs for `Tool=PW` rows, run PW + MCP cases, merge → quality gate; heal script faults, classify every failure | `quality-gate.md` | G3 | `result-analyst`, `bugs.mjs` |
| 4 ANALYSE | **result-analyst** | bug report (one bug per cause, stable ids, evidence), release recommendation, Jira CSV | `bug-report.md` | G4 | `bugs.mjs` |

Invoke each sub-skill in turn (it auto-loads, or read `.claude/skills/<name>/SKILL.md`).
**Stop at every gate.** Inside step 3, loop test-runner ↔ self-healer until every remaining
failure is a confirmed real bug.

## Approval gates

Each step ends at a gate the tester approves by a line under the file's title:
`> **Duyệt:** ✅ Đã duyệt — <name> — YYYY-MM-DD HH:mm` (pending: `> **Duyệt:** ⬜ Chờ duyệt`).
A gate passes when its file is approved, the previous gate passes, and it was approved no
earlier than the previous one; G3 also needs every failed TC of the latest run named in
`heal-proposal.md`. Scripts blocked by a gate exit **3** and say which gate and why.

```bash
node .claude/skills/web-test/gate.mjs https://brse.ai    # or: npm run status -- https://brse.ai
```
shows all four gates and the next step — run it at the start of every session and every step.

Rules for the agent:
- Never write "Đã duyệt" unless the tester said so in chat; the name comes from
  `git config user.name` unless they give another.
- Any content change to an approved file resets its line to `⬜ Chờ duyệt` (updating the
  plan's Status column and filling a Jira key are not content changes).
- Stop at every gate, and tell the tester in plain Vietnamese what to check (the file's
  "Việc của bạn trước khi duyệt" block says it too).

## Orchestrated run (the happy path)

```bash
node .claude/skills/web-test/gate.mjs https://brse.ai
# 1 REQUIREMENTS (requirement-analyst)
node .claude/skills/test-designer/explore.mjs https://brse.ai     # or crawl.mjs
#    → artifacts/brse.ai/requirements.md              … tester approves (G1)
# 2 DESIGN (test-designer) → artifacts/brse.ai/test-plan.md
node .claude/skills/test-designer/coverage.mjs https://brse.ai    # must exit 0
#                                                     … tester approves (G2)
# 3 EXECUTE (script-generator, test-runner, self-healer)
BASE_URL=https://brse.ai npm test      # runs artifacts/brse.ai/tests
#    then the Tool=MCP cases → mcp-results.json
BASE_URL=https://brse.ai npm run gate  # → quality-gate.md + runs/<runId>.json
#    failures → self-healer → heal-proposal.md … tester approves (G3)
# 4 ANALYSE (result-analyst) → artifacts/brse.ai/bug-report.md
#                                                     … tester approves (G4)
npm run bugs -- https://brse.ai        # → bugs.csv for Jira
```

`BASE_URL` is the single source that resolves `<host>` and every path under
`artifacts/<host>/`. See each sub-skill's SKILL.md for detail, and `checklist.md`
before declaring a session done.

## Conventions (shared by all sub-skills)
- One domain = one bundle under `artifacts/<host>/`. Nothing test-related at project root except `package.json`.
- REQ table columns: `REQ | Nhóm | Mô tả | Nguồn | Trạng thái | Xác nhận bởi`; Trạng thái ∈
  {Đã xác nhận, Chấp nhận tạm, Cần hỏi, Bỏ}.
- TC table columns: `TC | REQ | P | Tool | Mô tả | Các bước | Kỳ vọng | Status`. `Tool` ∈ {PW, MCP}.
- Spec test titles encode `TC-NNN [Pn]` so the gate can score them.
- Gate thresholds: P0 = 100% (else FAIL), P1 ≥ 95% (else CONCERNS), P2/P3 informational.
- Exit codes: 1 = FAIL / gaps / invalid input, 2 = BLOCKED / usage, 3 = an approval gate is not passed.

## Setup (once)
```bash
npm install && npx playwright install chromium
```

## Interop with BMAD testarch (if installed)
For repo/PRD/story-aware strategy, hand off to `bmad-testarch-test-design`,
`bmad-testarch-automate`, `bmad-testarch-trace`, `bmad-tea`. This workflow is the
black-box, URL-only counterpart that actually exercises a deployed site.
