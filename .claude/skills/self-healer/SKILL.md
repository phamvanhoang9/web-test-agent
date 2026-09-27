---
name: self-healer
description: Diagnose failing Playwright tests on the live page and propose fixes for approval. Use when web tests fail, are flaky, or need self-healing/repair. Uses chrome-devtools MCP to inspect the real DOM/console/network. Phase 5 of the web-test workflow.
---

Repair failing web tests. Phase 5 of the `web-test` workflow, triggered when
test-runner reports failures. **Diagnoses on the live page, then proposes a fix and
waits for your approval — it never auto-applies changes.**

Run from the project root. Work per failing case from `artifacts/<host>/quality-gate.md`.

## What to achieve
For each failure, find the *real* cause by looking at the actual page, then decide:
- **Real app bug** → report it clearly (TC, expected vs actual, evidence). Do **not**
  "fix" the test to hide it.
- **Flaky / wrong script** (stale selector, race, bad assumption) → propose a minimal
  spec fix.

## Start from the trace
Every failing PW test keeps a trace at `artifacts/<host>/test-results/<test>/trace.zip`
(`npx playwright show-trace <path>`): DOM snapshots before/after each action, how each
locator resolved, and network/console on one timeline. It records *the run that failed*,
so read it first — timing- or data-dependent failures may not reproduce on the live page.

## Diagnose on the live page (chrome-devtools MCP)
The Playwright error alone is often not enough — inspect reality:
- `mcp__chrome-devtools__navigate_page` to the failing URL (set up auth via steps if needed)
- `take_snapshot` — the real accessibility tree → find the correct role/label/selector
- `list_console_messages` / `list_network_requests` — JS errors or failing API calls behind the symptom
- `click` / `fill` / `wait_for` to reproduce the step that failed and see what actually happens

Map the symptom to a cause:
| Symptom | Likely cause | Fix direction |
|---|---|---|
| `locator not found` | selector changed / wrong | use the role/label seen in the snapshot |
| `timeout waiting for visible` | element loads late / behind state | web-first assertion or wait for the right precondition |
| assertion mismatch | app changed, or expectation wrong | confirm on live page → fix test OR report app bug |
| passes alone, fails in suite | shared state / order | isolate state, fix setup/teardown |

Selector guidance: `resources/knowledge/selector-resilience.md` (in script-generator).

## Propose — don't apply
Present, per failing case:
1. **Root cause** (with the evidence you saw on the live page).
2. **Real bug or test fix?**
3. If a test fix: the exact **diff** to the spec in `artifacts/<host>/tests/…`.
4. Wait for the user to approve. **Only after approval**, apply the edit, then ask
   test-runner to re-run; loop until green or remaining failures are confirmed real bugs.

## Gotcha
- chrome-devtools MCP must be connected. If absent, diagnose from the Playwright error +
  trace (`npx playwright show-trace <trace.zip>`) and say the live-page
  inspection was skipped.
