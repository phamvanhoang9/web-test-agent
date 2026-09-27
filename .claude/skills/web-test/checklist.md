# Self-validation checklist (run before declaring a test session done)

DESIGN — test-designer (`artifacts/<host>/test-plan.md`)
- [ ] Ran `explore.mjs`, or `crawl.mjs` for a large or login-gated site (chrome-devtools MCP for hard sites); opened and **looked at** the screenshot(s)
- [ ] If crawled: read the `site-map.md` warnings (limits, skipped URLs) and stated any incomplete coverage in the plan; every access-matrix row that differs between roles maps to a TC or a stated reason
- [ ] Noted redirects, HTTP status, console errors, failed requests
- [ ] Risks scored (probability × impact); every score ≥6 maps to a covering TC
- [ ] TC table filled: each row has P, **Tool (PW/MCP)**, steps, **verifiable** Kỳ vọng
- [ ] Coverage checklist reviewed — no whole category silently skipped
- [ ] User reviewed/approved the table (human gate) before generating

GENERATE — script-generator (`artifacts/<host>/tests/*.spec.mjs`)
- [ ] One test per `Tool=PW` row; titles encode `TC-NNN [Pn]`
- [ ] Locators role/label-based, not brittle CSS (selector-resilience.md)
- [ ] No `waitForTimeout` as a sync mechanism (web-first assertions instead)
- [ ] No real credentials committed — read from env

RUN+GATE — test-runner
- [ ] `Tool=PW` ran via `--config .claude/skills/test-runner/playwright.config.mjs` (BASE_URL set)
- [ ] `Tool=MCP` cases executed via chrome-devtools, recorded to `artifacts/<host>/mcp-results.json`
- [ ] `report.mjs` produced `quality-gate.md`; decision (PASS/CONCERNS/FAIL) matches reality
- [ ] **Reported back to the user**: counts, per-priority rates, failed-case list, links
- [ ] On staging for any data-mutating case; prod only for read-only/negative checks

HEAL — self-healer (only if failures)
- [ ] Diagnosed on the live page; distinguished real app bug vs flaky/wrong script
- [ ] Proposed fix as a diff and **waited for approval** before applying

Honesty
- [ ] Reported results faithfully — failures stated with evidence, skips called out
- [ ] No coverage cap hidden (if something was out of scope, said so)
