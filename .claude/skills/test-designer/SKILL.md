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

## Explore — three ways, by difficulty

**Default — Playwright headless** (fast, captures evidence to `artifacts/<host>/`):
```bash
node .claude/skills/test-designer/explore.mjs https://brse.ai
```
Writes `exploration.md` (redirects, status, console errors, failed requests, outline
of every field/button/link), `screenshot.png` (**open and look**), `console.json`,
`network.json`. Reach a page behind a click/login with `--steps steps.json` (array of
`{fill|click|waitFor|goto}`).

**Large site, or most of it behind a login — crawl first:**
```bash
node .claude/skills/test-designer/crawl.mjs https://app.example.com
```
Logs in as each role in `WEBTEST_ROLES` (credentials `TEST_<ROLE>_EMAIL` /
`TEST_<ROLE>_PASSWORD`, or `TEST_EMAIL` / `TEST_PASSWORD` for the default role — from the
shell, `.env.<host>`, then `.env`; login page `WEBTEST_LOGIN_PATH`, default `/login`),
follows same-origin links, `sitemap.xml` and the routes declared in the SPA's JS bundle
(React Router / Vue Router / Angular configs), groups URLs into route templates
(`/orders/:id`), and writes `artifacts/<host>/crawl/site-map.md`. Read it before anything else:
- **Warnings at the top** mean coverage is incomplete (page or time limit, rate limiting, a
  session that kept expiring). Say so in the plan.
- **Templates / Files** are the feature areas; `URLs seen` shows how big each is. Open
  `crawl/pages/<...>/exploration.md` (and its screenshot) only for templates you judge risky.
- **Access matrix** rows where roles differ are authorization cases (P0/P1). A `[file]` row
  that differs is a data-exposure risk (P0); also propose an ID-swap (IDOR) case — the crawler
  never tries other IDs.
- **Routes from JS bundle** lists routes no link points to — pages the UI only reaches through
  buttons. `opened` ones are crawled like links; `unsafe` and `no-id` (a `:param` no crawled
  page could fill) ones are not — cover them with chrome-devtools MCP if they matter.
- **Skipped URLs** under Warnings were never opened because they look state-changing (logout,
  delete, export...). If one is safe and matters, rerun with `--allow <regex>`.

It only follows links and never clicks or submits, which makes it fit for production — with
the redirect caveat under Gotchas. Limits:
`--max-pages` 200 per role, `--max-depth` 5, `--max-minutes` 15, `--delay-ms` 250,
`--samples` 3 per template.

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
- `crawl.mjs` login fails with `field-not-found`: the form is not at `/login` — set
  `WEBTEST_LOGIN_PATH`. SSO and MFA are not supported; use chrome-devtools MCP for those.
- The crawler aborts requests a page itself makes to a state-changing URL, but it cannot
  intercept a server-side redirect to one — whether the redirect answers a link, an image or
  a fetch. Keep `--exclude` for known dangerous paths.
- Bundle route discovery reads only the start page's own `<script>` / `modulepreload` files
  (up to 20). Next.js route manifests are not read, relative child routes are skipped, and a
  JS-only app with no router config yields nothing. Turn it off with `--no-bundle-routes`.
- `artifacts/<host>/.auth/*.json` holds live session tokens. It is gitignored with the rest of
  `artifacts/`; never copy it elsewhere.
