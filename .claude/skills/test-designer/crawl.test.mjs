import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_BYTES, startFixture, TRAPS, USERS } from './test-fixtures/app.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CRAWL = path.join(here, 'crawl.mjs');
const CREDENTIALS = {
  TEST_ADMIN_EMAIL: USERS.admin.email,
  TEST_ADMIN_PASSWORD: USERS.admin.password,
  TEST_USER_EMAIL: USERS.user.email,
  TEST_USER_PASSWORD: USERS.user.password,
};

/** process.env without any WEBTEST_* / TEST_* the developer happens to have set. */
function cleanEnv(vars) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(WEBTEST_|TEST_)/.test(key)));
  return { ...env, ...vars };
}

function paths(fixture, cwd) {
  const host = new URL(fixture.url).host.replace(/[^a-z0-9.-]/gi, '_');
  const crawlDir = path.join(cwd, 'artifacts', host, 'crawl');
  return { crawlDir, siteMap: () => JSON.parse(readFileSync(path.join(crawlDir, 'site-map.json'), 'utf8')) };
}

function runCrawl(
  fixture,
  args = [],
  env = { WEBTEST_ROLES: 'admin,user', ...CREDENTIALS },
  cwd = mkdtempSync(path.join(tmpdir(), 'webtest-crawl-')),
) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CRAWL, fixture.url, '--delay-ms', '0', ...args], { cwd, env: cleanEnv(env) },
      (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr, ...paths(fixture, cwd) }));
  });
}

describe('crawl as admin and user', () => {
  let fixture;
  let run;
  let map;
  const row = (template) => map.templates.find((t) => t.template === template);
  before(async () => {
    fixture = await startFixture();
    run = await runCrawl(fixture, ['--slug-threshold', '10']);
    map = run.siteMap();
  });
  after(() => fixture.close());

  test('exits 0', () => assert.equal(run.code, 0, run.stderr));

  test('never requests a trap URL, even one a page embeds (Review Focus)', () => {
    for (const trap of TRAPS) assert.equal(fixture.called(trap), false, trap);
  });

  test('never receives a whole file', async () => {
    for (const file of ['/docs/manual.pdf', '/legacy/report.pdf', '/files/get', '/invoices/1.pdf']) {
      const ended = await fixture.streamEnded(file);
      assert.notEqual(ended?.completed, true, file);
    }
  });

  test('groups ids and slugs into templates', () => {
    assert.equal(row('/orders/:id').urlsSeen, 50);
    assert.equal(row('/products/:slug').urlsSeen, 30);
  });

  test('finds pages reachable only from the nested sitemap or a hidden menu (Review Focus)', () => {
    assert.ok(row('/sitemap-only'));
    assert.ok(row('/hidden-menu'));
  });

  test('access matrix: admin-only pages and files are denied to user', () => {
    assert.deepEqual(map.access['/admin'], { admin: 'allowed', user: 'denied' });
    assert.deepEqual(map.access['/invoices/:id.pdf'], { admin: 'allowed', user: 'denied' });
    assert.deepEqual(map.access['/'], { admin: 'allowed', user: 'allowed' });
  });

  test('a page the SPA sends a role away from is "redirected", not "allowed"', () => {
    assert.deepEqual(map.access['/spa-admin'], { admin: 'allowed', user: 'redirected → /' });
    const evidence = readFileSync(path.join(run.crawlDir, row('/spa-admin').evidence), 'utf8');
    assert.match(evidence, /\*\*Final URL:\*\* http:\/\/127\.0\.0\.1:\d+\/spa-admin\n/);
  });

  test('an SPA page whose own API refuses a role is "API 404", not "allowed"', () => {
    assert.deepEqual(map.access['/statements/:id'], { admin: 'allowed', user: 'API 404' });
  });

  test('files: attachment reclassified, ranged fallback, broken file', () => {
    assert.equal(row('/files/get').kind, 'file');
    assert.ok(row('/legacy/report.pdf').visits.every((v) => v.method === 'range'));
    assert.equal(row('/docs/missing.pdf').status, 404);
    assert.equal(row('/docs/manual.pdf').bytes, FILE_BYTES);
  });

  test('console errors land on the right template', () => {
    assert.ok(map.health.some((h) => h.template === '/broken' && h.text === 'fixture-error'));
  });

  test('writes evidence with forward-slash paths and a site-map.md', () => {
    const evidence = row('/orders').evidence;
    assert.match(evidence, /^pages\/[^\\]+\/exploration\.md$/);
    assert.ok(existsSync(path.join(run.crawlDir, evidence)));
    assert.ok(existsSync(path.join(run.crawlDir, path.dirname(evidence), 'screenshot.png')));
    const md = readFileSync(path.join(run.crawlDir, 'site-map.md'), 'utf8');
    assert.ok(md.includes('## Access matrix'));
  });

  test('opens routes found only in the JS bundle, fills params, skips unsafe ones', () => {
    assert.ok(row('/hidden-route'));
    assert.ok(row('/orders/:id/receipt'));
    assert.ok(!fixture.requests.some((request) => request.path.endsWith('/live')));
    const outcomes = Object.fromEntries(map.bundleRoutes.routes.map((r) => [r.route, r.outcome]));
    assert.deepEqual(outcomes, {
      '/hidden-route': 'opened',
      '/orders/:id/receipt': 'opened',
      '/orders/:id/live': 'unsafe',
      '/reports/:reportId': 'no-id',
      '/team': 'opened',
    });
    assert.equal(map.bundleRoutes.relative, 1);
    assert.ok(readFileSync(path.join(run.crawlDir, 'site-map.md'), 'utf8').includes('## Routes from JS bundle'));
  });

  test('reports skipped unsafe URLs and external origins', () => {
    assert.ok(map.warnings.unsafeSkipped.examples.includes(`${fixture.url}/logout`));
    assert.equal(map.warnings.externalOrigins, 1);
    assert.deepEqual(map.limitWarnings, []);
  });
});

describe('crawl failures and limits', () => {
  test('missing credentials: exit 1 naming the variable, never a value', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());

    const run = await runCrawl(fixture, [], { WEBTEST_ROLES: 'admin', TEST_ADMIN_EMAIL: USERS.admin.email });

    assert.equal(run.code, 1);
    assert.match(run.stderr, /TEST_ADMIN_PASSWORD/);
    assert.ok(!run.stderr.includes(USERS.admin.email));
  });

  test('wrong password: exit 1 at still-on-login, password not echoed', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());

    const run = await runCrawl(fixture, [], {
      WEBTEST_ROLES: 'admin', TEST_ADMIN_EMAIL: USERS.admin.email, TEST_ADMIN_PASSWORD: 'not-the-fixture-pass',
    });

    assert.equal(run.code, 1);
    assert.match(run.stderr, /still-on-login/);
    assert.ok(!run.stderr.includes('not-the-fixture-pass'));
  });

  test('an expired session is renewed once and the lost pages are revisited', async (t) => {
    const fixture = await startFixture({ expireSessionsAfter: 8 });
    t.after(() => fixture.close());

    const run = await runCrawl(fixture, ['--concurrency', '1'], { WEBTEST_ROLES: 'admin', ...CREDENTIALS });
    const map = run.siteMap();

    assert.equal(run.code, 0, run.stderr);
    assert.equal(fixture.logins.admin, 2);
    assert.deepEqual(map.limitWarnings, []);
    assert.ok(!map.templates.some((t) => t.visits.length && t.visits.every((v) => v.loginRedirect)));
  });

  test('a page whose screenshot times out still yields its links', { timeout: 180_000 }, async (t) => {
    const fixture = await startFixture({ slowFontHome: true });
    t.after(() => fixture.close());

    const run = await runCrawl(fixture, [], { WEBTEST_ROLES: 'admin', ...CREDENTIALS });
    const map = run.siteMap();

    assert.equal(run.code, 0, run.stderr);
    assert.ok(map.templates.some((row) => row.template === '/products'), '/products is linked only from /');
    assert.ok(map.health.some((h) => h.template === '/' && h.type === 'screenshot-error'));
  });

  test('forbidden pages that redirect to login are access findings, not an expired session', async (t) => {
    const fixture = await startFixture({ denyByRedirect: true });
    t.after(() => fixture.close());

    const run = await runCrawl(fixture);
    const map = run.siteMap();

    assert.equal(run.code, 0, run.stderr);
    assert.equal(fixture.logins.user, 1, 'no re-login was attempted');
    assert.deepEqual(map.limitWarnings, []);
    assert.equal(map.access['/admin'].user, 'login-redirect');
    assert.ok(!map.templates.some((row) => row.template === '/login'), 'the login page is never crawled');
  });

  test('each crawl starts from an empty pages folder', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());
    const cwd = mkdtempSync(path.join(tmpdir(), 'webtest-crawl-'));
    const stale = path.join(paths(fixture, cwd).crawlDir, 'pages', 'admin-00000000');
    mkdirSync(stale, { recursive: true });
    writeFileSync(path.join(stale, 'exploration.md'), 'evidence from an earlier crawl');

    const run = await runCrawl(fixture, [], { WEBTEST_ROLES: 'admin', ...CREDENTIALS }, cwd);

    assert.equal(run.code, 0, run.stderr);
    assert.equal(existsSync(stale), false);
    const evidence = run.siteMap().templates.find((row) => row.template === '/orders').evidence;
    assert.ok(existsSync(path.join(run.crawlDir, evidence)));
  });

  test('--no-bundle-routes turns route discovery off', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());

    const run = await runCrawl(fixture, ['--no-bundle-routes'], { WEBTEST_ROLES: 'admin', ...CREDENTIALS });
    const map = run.siteMap();

    assert.equal(run.code, 0, run.stderr);
    assert.equal(map.bundleRoutes, null);
    assert.ok(!map.templates.some((row) => row.template === '/hidden-route'));
  });

  test('persistent 429 stops the role with a warning', async (t) => {
    const fixture = await startFixture({ tooManyRequests: '/orders' });
    t.after(() => fixture.close());

    const run = await runCrawl(fixture, ['--concurrency', '1'], { WEBTEST_ROLES: 'admin', ...CREDENTIALS });

    assert.equal(run.code, 0, run.stderr);
    assert.ok(run.siteMap().limitWarnings.some((w) => /rate limited \(HTTP 429\)/.test(w)));
  });

  test('time limit: writes a partial site map flagged at the top', async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());

    const run = await runCrawl(fixture, ['--max-minutes', '0.02', '--delay-ms', '400']);

    assert.equal(run.code, 0, run.stderr);
    assert.match(run.siteMap().limitWarnings[0], /time limit .* partial site map/);
    const md = readFileSync(path.join(run.crawlDir, 'site-map.md'), 'utf8');
    assert.ok(md.indexOf('> **Warning:** time limit') < md.indexOf('## Summary'));
  });

  test('SIGINT: writes a partial site map', { skip: process.platform === 'win32' && 'Windows cannot deliver SIGINT to a child process' }, async (t) => {
    const fixture = await startFixture();
    t.after(() => fixture.close());
    const cwd = mkdtempSync(path.join(tmpdir(), 'webtest-crawl-'));
    const child = spawn(process.execPath, [CRAWL, fixture.url, '--delay-ms', '300'], {
      cwd, env: cleanEnv({ WEBTEST_ROLES: 'admin,user', ...CREDENTIALS }),
    });
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('crawling as')) child.kill('SIGINT');
    });

    const code = await new Promise((resolve) => child.on('close', resolve));

    assert.equal(code, 0);
    assert.match(paths(fixture, cwd).siteMap().limitWarnings[0], /SIGINT/);
  });
});
