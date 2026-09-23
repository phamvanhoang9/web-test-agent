---
name: test-designer
description: Explore a website and design a risk-based test plan from just a URL. Use when asked to create test cases, a test plan, or explore/QA-scope a web app. Produces artifacts/<host>/test-plan.md with an editable TC table. Phase 1 of the web-test workflow.
---

Turn a URL into a reviewable, risk-based **test plan**. Phase 1 of the `web-test`
workflow. Output: `artifacts/<host>/test-plan.md` — a table the user can edit, that
script-generator and test-runner consume downstream.

Run from the project root. `<host>` = the URL's host (e.g. `brse.ai`).

## What to achieve
1. **Explore the live site** to learn what actually exists (don't guess test cases).
2. **Assess risk** (probability × impact) and turn the riskiest behaviours into test
   cases — don't pad the plan with cases no risk justifies.
3. **Pick the execution tool per case**: Playwright (`PW`) for deterministic checks;
   chrome-devtools MCP (`MCP`) for cases Playwright handles poorly (heavy dynamic DOM,
   canvas/drag, things that need live inspection).

## Explore — two ways, by difficulty

**Default — Playwright headless** (fast, captures evidence to `artifacts/<host>/`):
```bash
node .claude/skills/test-designer/explore.mjs https://brse.ai
```
Writes `exploration.md` (redirects, status, console errors, failed requests, outline
of every field/button/link), `screenshot.png` (**open and look**), `console.json`,
`network.json`. Reach a page behind a click/login with `--steps steps.json` (array of
`{fill|click|waitFor|goto}`).

**When that's not enough — chrome-devtools MCP** (interactive, for auth-gated / heavy
SPA / dynamic content): drive the real browser to understand the flow before writing
cases — `mcp__chrome-devtools__navigate_page`, `take_snapshot`, `click`, `fill`,
`list_console_messages`, `list_network_requests`. Use what you learn to fill the plan,
and mark those cases `Tool=MCP`.

## Write the plan
Copy the template and fill it from the exploration:
```bash
mkdir -p artifacts/<host>
cp .claude/skills/test-designer/templates/test-cases.template.md artifacts/<host>/test-plan.md
```
- Score risks (probability × impact → P0–P3). Background: `resources/knowledge/risk-scoring.md`.
- Fill the **`## Test cases` table**: `TC | P | Tool | Mô tả | Các bước | Kỳ vọng | Status`.
  Multi-step "Các bước" separated by `;`. Choose `PW` or `MCP` per row.
- Push each check to the lowest level that proves it (`resources/knowledge/test-levels.md`).
- Cover the categories in the coverage checklist; if you skip one, say why.

Worked example: `examples/brse.ai.plan.md`.

## Hand off
Tell the user the plan is ready at `artifacts/<host>/test-plan.md` and ask them to
review/edit the table (human gate) before script-generator runs.

## Gotchas
- `explore.mjs` waits for `networkidle`; websocket/long-poll sites may time out (30s) —
  it still captures what loaded and logs the nav error. Switch to chrome-devtools MCP for those.
- Empty button label in the outline = icon-only button; identify by `aria-label`, not text.
- Note staging vs production in the plan; data-mutating cases belong on staging.
