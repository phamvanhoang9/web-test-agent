---
name: web-test
description: E2E web-testing orchestrator — test any website black-box from just a URL. Use when asked to test/QA a web app, check a URL end-to-end, or run the full design→generate→run→gate flow. Sequences test-designer → script-generator → test-runner → self-healer.
---

End-to-end black-box web testing for this project. This skill is the **orchestrator**:
it sequences four focused sub-skills to take a URL all the way to a quality-gate
decision. No source code of the target needed.

Everything for a target site is grouped under `artifacts/<host>/` (host derived
from the URL, e.g. `artifacts/brse.ai/`). Run commands from the project root.

## The four sub-skills

| Phase | Sub-skill | Does | Output |
|---|---|---|---|
| 1 DESIGN | **test-designer** | explore the site (Playwright headless, or chrome-devtools MCP for hard/dynamic sites) → risk-based plan with a TC table; picks PW vs MCP per case | `artifacts/<host>/test-plan.md` |
| 2 REVIEW | _(human)_ | user edits/approves the TC table — it's the source of truth | — |
| 3 GENERATE | **script-generator** | turn each `Tool=PW` row into a Playwright spec | `artifacts/<host>/tests/*.spec.mjs` |
| 4 RUN+GATE | **test-runner** | run PW specs + execute `Tool=MCP` cases via chrome-devtools → merge → gate → **report back** | `artifacts/<host>/{results.json,mcp-results.json,quality-gate.md,html-report}` |
| 5 HEAL | **self-healer** | on failures, diagnose on the live page → **explain each fix in plain language (waits for approval)** | `heal-proposal.md`, then edited specs (after you approve) |

Invoke each sub-skill in turn (it auto-loads, or read `.claude/skills/<name>/SKILL.md`).
Stop at phase 2 for the user to approve the plan. Loop 4↔5 until the gate is green
or remaining failures are confirmed real bugs.

## Orchestrated run (the happy path)

```bash
# 1 DESIGN  (test-designer)
node .claude/skills/test-designer/explore.mjs https://brse.ai
#    → write artifacts/brse.ai/test-plan.md from the template (TC table)
# 2 REVIEW  → user edits the table
# 3 GENERATE (script-generator) → artifacts/brse.ai/tests/*.spec.mjs
# 4 RUN+GATE (test-runner)
BASE_URL=https://brse.ai npm test      # runs artifacts/brse.ai/tests
BASE_URL=https://brse.ai npm run gate  # merges results → quality-gate.md + summary
# 5 HEAL    (self-healer) only if step 4 reported failures
```

`BASE_URL` is the single source that resolves `<host>` and every path under
`artifacts/<host>/`. See each sub-skill's SKILL.md for detail, and `checklist.md`
before declaring a session done.

## Conventions (shared by all sub-skills)
- One domain = one bundle under `artifacts/<host>/`. Nothing test-related at project root except `package.json`.
- TC table columns: `TC | P | Tool | Mô tả | Các bước | Kỳ vọng | Status`. `Tool` ∈ {PW, MCP}.
- Spec test titles encode `TC-NNN [Pn]` so the gate can score them.
- Gate thresholds: P0 = 100% (else FAIL), P1 ≥ 95% (else CONCERNS), P2/P3 informational.

## Setup (once)
```bash
npm install && npx playwright install chromium
```

## Interop with BMAD testarch (if installed)
For repo/PRD/story-aware strategy, hand off to `bmad-testarch-test-design`,
`bmad-testarch-automate`, `bmad-testarch-trace`, `bmad-tea`. This workflow is the
black-box, URL-only counterpart that actually exercises a deployed site.
