---
name: script-generator
description: Generate Playwright test scripts from a test plan. Use when asked to write/generate Playwright specs or automate test cases from a test-plan.md. Reads the TC table and emits artifacts/<host>/tests/*.spec.mjs. Phase 3 of the web-test workflow.
---

Turn an approved test plan into runnable Playwright specs. Phase 3 of the `web-test`
workflow. Input: `artifacts/<host>/test-plan.md` (TC table). Output:
`artifacts/<host>/tests/<area>.spec.mjs`.

Run from the project root.

## What to achieve
Read the plan's **`## Test cases` table** and, for every row with **`Tool=PW`**,
write a Playwright `test()`. Skip `Tool=MCP` rows — those run via test-runner driving
chrome-devtools, not as specs. Generation is **judgement-driven** (you read the table +
the exploration, then write idiomatic tests) — there is no rigid parser to satisfy.

## How
1. Read `artifacts/<host>/test-plan.md` and `artifacts/<host>/exploration.md` (real
   selectors/elements observed on the site).
2. **Existing specs are edited, never replaced** — they carry fixes the healer made and the
   user approved. Add a `test()` for each new `Tool=PW` row to the spec for its area. Only for
   an area with no spec yet, start from the template:
   ```bash
   mkdir -p artifacts/<host>/tests
   cp -n .claude/skills/script-generator/templates/example.spec.mjs artifacts/<host>/tests/<area>.spec.mjs
   ```
3. One `test()` per `Tool=PW` row. **Encode the TC id + priority in the title** so the
   gate scores it: `test('TC-001 [P0] <Mô tả>', async ({ page }) => { ... })`.
4. Translate "Các bước" → actions and "Kỳ vọng" → assertions.
5. Use **resilient locators** — `getByRole`/`getByLabel`/`getByText` over brittle CSS;
   web-first assertions (`await expect(...).toBeVisible()`); `fill()` not `el.value=`.
   See `resources/knowledge/selector-resilience.md`.

Worked example: `examples/brse-login.spec.mjs` (maps TC-001…TC-005 from the brse.ai plan).

## Notes
- Specs use `baseURL` (test-runner sets it from `BASE_URL`), so navigate with `page.goto('/')`, `page.goto('/login')`.
- Group a site's tests by area into one or a few `*.spec.mjs` files under `artifacts/<host>/tests/`.
- Don't invent cases not in the table — if the plan misses something, send it back to test-designer.
- **Bring your own data.** Never make a test depend on a record that happens to exist on the site
  (a meeting, an order, a user) — someone deletes it and a dozen cases fail with no app bug.
  Create what the tests need in a fixture, through the site's API where it has one, and delete
  it for good in the fixture's teardown: one worker-scoped record for read-only cases, a
  test-scoped one for each case that edits or deletes. Name them `e2e-*` so leftovers are
  recognisable. Reading a record that belongs to the site's own seed (a system dictionary, a
  plan catalogue) is fine; say so in the plan.
- Hand off to **test-runner** to execute.
