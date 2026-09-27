import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { startFixture } from '../test-fixtures/app.mjs';
import { capturePage, renderExploration } from './capture.mjs';

describe('capturePage', () => {
  let fixture;
  let browser;
  before(async () => {
    fixture = await startFixture({ requireAuth: false });
    browser = await chromium.launch();
  });
  after(async () => {
    await browser.close();
    await fixture.close();
  });

  test('collects status, outline, skeleton, console errors and every link', async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close());

    const result = await capturePage(page, `${fixture.url}/public`);

    assert.equal(result.status, 200);
    assert.equal(result.isFile, false);
    assert.equal(result.title, 'Fixture public');
    assert.deepEqual(result.skeleton, { fields: 1, buttons: 2, landmarks: ['banner', 'form', 'main', 'navigation'] });
    assert.ok(result.consoleMsgs.some((m) => m.type === 'error' && m.text === 'fixture-error'));
    assert.ok(result.hrefs.includes(`${fixture.url}/hidden-menu`), 'hidden links are still collected');
  });

  test("'settled' returns on a long-poll page without a navigation error (Review Focus)", async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close());
    const started = Date.now();

    const result = await capturePage(page, `${fixture.url}/long-poll`, { waitStrategy: 'settled' });

    assert.equal(result.status, 200);
    assert.ok(Date.now() - started < 15_000, 'did not wait for a network that never settles');
    assert.ok(!result.consoleMsgs.some((m) => m.type === 'nav-error'));
  });

  test('an attachment is reported as a file and its download is cancelled', async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close());

    const result = await capturePage(page, `${fixture.url}/files/get?id=3`, { waitStrategy: 'settled' });

    assert.equal(result.isFile, true);
    assert.equal(result.hrefs, undefined);
    const ended = await fixture.streamEnded('/files/get');
    assert.notEqual(ended?.completed, true);
  });

  test('renderExploration keeps the exploration.md shape', async (t) => {
    const page = await browser.newPage();
    t.after(() => page.close());
    const result = await capturePage(page, `${fixture.url}/public`);

    const md = renderExploration(result, 'fixture.test');

    assert.ok(md.startsWith('# Exploration report — fixture.test\n'));
    assert.ok(md.includes('- **HTTP status:** 200'));
    assert.ok(md.includes('### Fields (1)'));
    assert.ok(md.includes('- `error` fixture-error'));
  });
});
