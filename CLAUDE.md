# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`web-test-agent` is not an application — it is a **skill-driven E2E testing workflow**. The
"code" is four project-local Claude skills under `.claude/skills/` plus the Node scripts
they drive (`explore.mjs`, `crawl.mjs`, `report.mjs`) and a small shared `test-designer/lib/`. It tests *other* websites black-box, from nothing but a URL. There is no source
code of the target under test here.

## Commands

```bash
npm install && npx playwright install chromium     # one-time setup

# 1 DESIGN — explore a live site, write evidence into artifacts/<host>/
node .claude/skills/test-designer/explore.mjs https://example.com
node .claude/skills/test-designer/explore.mjs https://example.com --steps steps.json
node .claude/skills/test-designer/crawl.mjs https://example.com   # multi-page, multi-role -> crawl/site-map.md

npm run test:unit                                  # node --test for the skill scripts (no target site needed)

# 3 GENERATE — no command; the agent authors artifacts/<host>/tests/*.spec.mjs

# 4 RUN + GATE
BASE_URL=https://example.com npm test              # all specs for that host
BASE_URL=https://example.com npm run gate          # merge results -> quality-gate.md

# single spec / single test case
BASE_URL=https://example.com npx playwright test --config .claude/skills/test-runner/playwright.config.mjs artifacts/example.com/tests/login.spec.mjs
BASE_URL=https://example.com npx playwright test --config .claude/skills/test-runner/playwright.config.mjs -g "TC-003"

npx playwright show-report artifacts/example.com/html-report
```

**On Windows PowerShell** the inline `VAR=value cmd` prefix does not exist — use
`$env:BASE_URL = "https://example.com"; npm test`, or run these through the Bash tool.

## Architecture

### The pipeline

Five phases, orchestrated by the `web-test` skill; each sub-skill is a phase and hands off
to the next. `.claude/skills/web-test/SKILL.md` is the map, `checklist.md` the exit criteria.

1. **test-designer** — `explore.mjs` drives headless Chromium and dumps evidence
   (`exploration.md`, `screenshot.png`, `console.json`, `network.json`); the agent reads it,
   scores risks, and writes `test-plan.md` from `templates/test-cases.template.md`.
2. **human review** — a hard stop. The user edits and approves the TC table before anything
   is generated. Do not skip past this.
3. **script-generator** — reads the TC table, emits one `test()` per `Tool=PW` row.
4. **test-runner** — runs the specs, *and* drives `Tool=MCP` rows itself via chrome-devtools
   MCP, then `report.mjs` merges both into the gate decision.
5. **self-healer** — only on failure. Diagnoses on the live page, **proposes a diff and waits
   for approval**; it never auto-edits a spec.

### The test-plan table is the contract

`artifacts/<host>/test-plan.md` holds a Markdown table — columns
`TC | P | Tool | Mô tả | Các bước | Kỳ vọng | Status` — that every downstream phase reads.
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
That same sanitization is duplicated in [lib/bundle.mjs](.claude/skills/test-designer/lib/bundle.mjs) (used by explore and crawl),
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
in the denominator. `WAIVED` is a human override only.

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
- `report.mjs` works from `mcp-results.json` alone when a plan has no `PW` rows.
- chrome-devtools MCP is configured in `.mcp.json` (the leading dot matters — Claude Code only
  reads project-scoped servers from `.mcp.json`, and a server only loads at session start);
  if it isn't connected, run the `PW` cases,
  report the `MCP` ones as skipped, and say so explicitly. It also passes
  `--chrome-arg=--use-fake-ui-for-media-stream` and
  `--chrome-arg=--auto-select-desktop-capture-source=Entire screen` so the native screen-share
  picker is answered automatically.
- A control stuck on `Starting...`/`Connecting...` with no console error is the native
  `getUserMedia`/`getDisplayMedia` picker waiting outside the DOM, not an app bug. The flags
  above fix it; see
  `.claude/skills/test-runner/resources/knowledge/media-capture-cases.md`.
- An MCP case that writes real data on staging must be cleaned up by the agent right after the
  verdict is recorded — nothing enforces it the way a Playwright fixture would.
- `crawl.mjs` is read-only by construction: it follows links only, skips URLs whose path or
  query contains logout/delete/export-style words, and aborts such requests made by pages
  themselves. `artifacts/<host>/.auth/<role>.json` holds live session tokens.
- `.env.<host>` then `.env` are loaded by `crawl.mjs` and `playwright.config.mjs` (shell wins);
  `explore.mjs` reads no credentials.
