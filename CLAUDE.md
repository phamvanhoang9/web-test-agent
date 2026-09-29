# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`web-test-agent` is not an application — it is a **skill-driven E2E testing workflow** that
follows a tester's four steps (requirement analysis → test design → execution → result
analysis), each ending at a tester approval gate. The "code" is six project-local Claude skills
under `.claude/skills/` plus the Node scripts they drive (`explore.mjs`, `crawl.mjs`,
`coverage.mjs`, `report.mjs`, `gate.mjs`, `bugs.mjs`) and small shared libs in
`test-designer/lib/`, `test-runner/lib/`, `web-test/lib/` and `result-analyst/lib/`. It tests
*other* websites black-box, from a URL plus whatever requirement documents the tester has.
There is no source code of the target under test here.

## Commands

```bash
npm install && npx playwright install chromium     # one-time setup
npm run status -- https://example.com              # gates G1–G4 and the next step (gate.mjs)

# 1 REQUIREMENTS — explore a live site, write evidence into artifacts/<host>/
node .claude/skills/test-designer/explore.mjs https://example.com
node .claude/skills/test-designer/explore.mjs https://example.com --steps steps.json
node .claude/skills/test-designer/crawl.mjs https://example.com   # multi-page, multi-role -> crawl/site-map.md

# 2 DESIGN
node .claude/skills/test-designer/coverage.mjs https://example.com  # plan vs requirements + exploration -> coverage.md; exit 1 = gaps, 3 = G1 not passed

npm run test:unit                                  # node --test for the skill scripts (no target site needed)

# 3 EXECUTE — the agent authors artifacts/<host>/tests/*.spec.mjs, then
BASE_URL=https://example.com npm test              # all specs for that host; refuses before G2
BASE_URL=https://example.com npm run gate          # merge results -> quality-gate.md + runs/<runId>.json; exit 3 before G2

# 4 ANALYSE — the agent writes bug-report.md, then after G4
npm run bugs -- https://example.com                # -> bugs.csv for Jira; exit 3 before G3/G4, 1 = invalid bug

# single spec / single test case
BASE_URL=https://example.com npx playwright test --config .claude/skills/test-runner/playwright.config.mjs artifacts/example.com/tests/login.spec.mjs
BASE_URL=https://example.com npx playwright test --config .claude/skills/test-runner/playwright.config.mjs -g "TC-003"

npx playwright show-report artifacts/example.com/html-report
```

**On Windows PowerShell** the inline `VAR=value cmd` prefix does not exist — use
`$env:BASE_URL = "https://example.com"; npm test`, or run these through the Bash tool.

## Architecture

### The pipeline

Four steps, orchestrated by the `web-test` skill; each ends at an approval gate and **stops
there until the tester approves**. `.claude/skills/web-test/SKILL.md` is the map,
`checklist.md` the exit criteria.

1. **requirement-analyst** — reads the documents in `artifacts/<host>/requirements/`, runs
   `explore.mjs` / `crawl.mjs` (evidence: `exploration.md`, `screenshot.png`, `console.json`,
   `network.json`, `crawl/`), and writes `requirements.md`: testable `REQ-NNN`s with a source and
   a status, business flows, open questions. → **G1**
2. **test-designer** — scores risks and writes `test-plan.md` from
   `templates/test-cases.template.md`, linking each TC to REQs; `coverage.mjs` must exit 0. → **G2**
3. **script-generator** emits one `test()` per `Tool=PW` row; **test-runner** runs the specs,
   drives `Tool=MCP` rows itself via chrome-devtools MCP, and `report.mjs` merges both into the
   gate decision; **self-healer** (only on failure) diagnoses on the live page, **explains each
   fix in plain language (never a diff — the reader is a tester) and waits for approval**, and
   classifies every failure in `heal-proposal.md`. → **G3**
4. **result-analyst** — writes `bug-report.md` (one bug per cause, stable ids, evidence copied
   to `bugs/BUG-NNN/`, release recommendation). → **G4**, then `bugs.mjs` exports `bugs.csv`.

### Approval gates

Gated files carry one line under their title: `> **Duyệt:** ⬜ Chờ duyệt` or
`> **Duyệt:** ✅ Đã duyệt — <name> — YYYY-MM-DD HH:mm`. `web-test/lib/approval.mjs` is the only
reader. A gate passes when its file is approved, the previous gate passes, and it was approved no
earlier than the previous one; G3 also needs every failed TC of the latest `runs/` snapshot named
in a `heal-proposal.md` written after that run. Blocked scripts exit **3** with the reason.
The agent never writes "Đã duyệt" unless the tester said so, and resets the line when it changes
an approved file's content (the plan's Status column and a bug's Jira key are not content).

### The test-plan table is the contract

`artifacts/<host>/test-plan.md` holds a Markdown table — columns
`TC | REQ | P | Tool | Mô tả | Các bước | Kỳ vọng | Status` — that every downstream phase reads.
REQ ids are found by `REQ-\d+` anywhere in a TC row (`web-test/lib/requirements.mjs`), the same
way TC ids are. The two other machine-read contracts: the requirement table of
`requirements.md` (header row starting `| REQ |`; the `Mô tả` and `Trạng thái` columns are found
by name; statuses `Đã xác nhận` / `Chấp nhận tạm` / `Cần hỏi` / `Bỏ`), and the bug sections of
`bug-report.md` (`## BUG-NNN: <title>`, fields `**<Tên>:** <giá trị>` with the names in
`result-analyst/lib/bug-report.mjs`).
The plan template and examples are written in Vietnamese; keep new plans in the same language
as the template. There is no parser: generation is judgement-driven, so the table's shape
matters more than its exact whitespace. Multi-step "Các bước" cells separate steps with `;`.

`Tool` splits execution: `PW` rows become Playwright specs, `MCP` rows are executed live by
the agent through `mcp__chrome-devtools__*` and hand-recorded into
`artifacts/<host>/mcp-results.json`
(`[{tc, prio, status: 'passed'|'failed'|'skipped', title, durationMs?, note?}]` — `skipped`
means *could not be verified*, and always carries a `note` saying why). A plan can
mix both. Use `MCP` for heavy dynamic DOM, canvas/drag, or anything needing live inspection.

### BASE_URL resolves everything

`BASE_URL` is the single knob. Its host, sanitized with `replace(/[^a-z0-9.-]/gi, '_')`, names
the per-domain bundle `artifacts/<host>/` — so `localhost:3000` maps to `artifacts/localhost_3000/`.
That same sanitization is duplicated in [lib/bundle.mjs](.claude/skills/test-designer/lib/bundle.mjs) (used by explore, crawl, coverage, gate and bugs),
[playwright.config.mjs](.claude/skills/test-runner/playwright.config.mjs), and
[report.mjs](.claude/skills/test-runner/report.mjs) — if you change one, change all three or
the phases will write and read different folders. `WEBTEST_HOST` overrides the derived host.

The Playwright config sets `baseURL`, so specs navigate with `page.goto('/')`, never absolute URLs.

### Scoring depends on the test title

`report.mjs` parses the TC id and priority out of the test title (`/\b(TC-\d+)\b/` and
`/\[(P[0-3])\]/`). A spec titled anything other than `TC-001 [P0] <description>` loses its
traceability row and defaults to P1. This title convention is the only link between the plan
and the results.

Gate thresholds: P0 must be 100% or the decision is FAIL (and `report.mjs` exits 1); a *skipped*
P0 case yields BLOCKED instead (exit 2) — unverified, not broken; P1 below 95% is CONCERNS;
P2/P3 failures are informational. Pass rate counts executed cases only, so a skip never lands
in the denominator. `WAIVED` is a human override only. Requirement results never change the
decision.

`quality-gate.md` and the console summary are written in Vietnamese (the tester approves it at
G3); the CI YAML keeps English keys. Each run also writes `runs/<runId>.json`
(`test-runner/lib/history.mjs`), which the "so với lần chạy trước" section and G3's
unclassified-failure check read; a TC reported twice keeps its worst result.

## Conventions

- One domain, one bundle. Nothing test-related lives at the project root except `package.json`.
- `artifacts/` is entirely gitignored. This repo publishes the workflow, not the output of a
  run: a bundle describes a specific target site, so it stays on the machine that made it.
- Locators are role/label-based (`getByRole`, `getByLabel`); no brittle CSS, no
  `waitForTimeout` as a synchronization mechanism. See
  `.claude/skills/script-generator/resources/knowledge/selector-resilience.md`.
- Credentials come from env (`TEST_EMAIL` / `TEST_PASSWORD`), never from the plan or a spec.
- Data-mutating cases run against staging; production gets read-only and negative checks only.
- A failing test is a hypothesis, not a verdict: self-healer must distinguish a real app bug
  (report it) from a broken script (fix it). Never "heal" a test into hiding a real bug.

## Gotchas

- `explore.mjs` waits for `networkidle` with a 30s timeout; websocket/long-poll sites time out.
  It still captures what loaded and logs the nav error — switch such sites to chrome-devtools MCP.
- An empty button label in the exploration outline means an icon-only button; target its
  `aria-label`.
- `report.mjs` works from `mcp-results.json` alone when a plan has no `PW` rows. With both, an
  `mcp-results.json` older than the Playwright run counts as skipped — run MCP cases after
  Playwright. It also rewrites the plan's Status column and archives an old `heal-proposal.md`.
- Re-running on an existing `artifacts/<host>/` never starts over: `requirements.md`,
  `test-plan.md`, `bug-report.md` and `tests/*.spec.mjs` are updated in place, never replaced
  by their templates; REQ, TC and BUG ids are kept.
- A bundle made before the approval gates existed has no approved `requirements.md`, so
  `coverage.mjs`, `npm test` and `report.mjs` exit 3 until step 1 runs and is approved.
- An inferred business rule is never `Đã xác nhận`: it is `Cần hỏi` and gets no test case until
  the PO answers. A pass on a `Chấp nhận tạm` REQ is a regression baseline, not proof.
- `docs/` is excluded locally (`.git/info/exclude`) on the maintainer's machine; the tester
  guides there are not in the repo.
- chrome-devtools MCP is configured in `.mcp.json` (the leading dot matters — Claude Code only
  reads project-scoped servers from `.mcp.json`, and a server only loads at session start). A
  new machine shows it as "Pending approval" until it is approved once, or pre-approved with
  `enabledMcpjsonServers` + an `mcp__chrome-devtools` allow rule in `.claude/settings.local.json`;
  if it isn't connected, drive the `MCP` cases with a scratch Playwright script (fake media
  flags for microphone/screen cases) rather than skipping them; `Tool=MCP` cases never wait for
  a confirmation. It also passes
  `--chrome-arg=--use-fake-ui-for-media-stream` and
  `--chrome-arg=--auto-select-desktop-capture-source=Entire screen` so the native screen-share
  picker is answered automatically.
- A control stuck on `Starting...`/`Connecting...` with no console error is the native
  `getUserMedia`/`getDisplayMedia` picker waiting outside the DOM, not an app bug. The flags
  above fix it; see
  `.claude/skills/test-runner/resources/knowledge/media-capture-cases.md`.
- An MCP case that writes real data on staging must be cleaned up by the agent right after the
  verdict is recorded — nothing enforces it the way a Playwright fixture would.
- `crawl.mjs` is read-only by design: it follows links only, skips URLs whose path or query
  contains logout/delete/export-style words, and aborts such requests made by pages
  themselves. Routes found in the SPA's JS bundle go through the same filter (plus `live` and
  `callback`). It cannot intercept a server-side redirect to such a URL, so keep `--exclude`
  for known dangerous paths. `artifacts/<host>/.auth/<role>.json` holds live session tokens.
- `.env.<host>` then `.env` are loaded by `crawl.mjs` and `playwright.config.mjs` (shell wins);
  `explore.mjs` reads no credentials.
