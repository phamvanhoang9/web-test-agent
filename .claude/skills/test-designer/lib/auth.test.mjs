import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startFixture, USERS } from '../test-fixtures/app.mjs';
import { credentialVars, login, LoginError, missingCredentials } from './auth.mjs';

function withEnv(t, vars) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
const stateDir = () => mkdtempSync(path.join(tmpdir(), 'webtest-auth-'));

test('credentialVars: default role uses TEST_*, others TEST_<ROLE>_*', () => {
  assert.deepEqual(credentialVars('default'), { email: 'TEST_EMAIL', password: 'TEST_PASSWORD' });
  assert.deepEqual(credentialVars('admin'), { email: 'TEST_ADMIN_EMAIL', password: 'TEST_ADMIN_PASSWORD' });
});

test('missingCredentials names missing or empty variables only', () => {
  const env = { TEST_ADMIN_EMAIL: 'a@x', TEST_ADMIN_PASSWORD: 'p', TEST_USER_EMAIL: 'u@x', TEST_USER_PASSWORD: '' };
  assert.deepEqual(missingCredentials(['admin', 'user'], env), ['TEST_USER_PASSWORD']);
});

describe('login', () => {
  let fixture;
  let browser;
  before(async () => {
    fixture = await startFixture();
    browser = await chromium.launch();
  });
  after(async () => {
    await browser.close();
    await fixture.close();
  });

  test('one-step form: saves a storage state holding the session cookie', async (t) => {
    withEnv(t, { TEST_ADMIN_EMAIL: USERS.admin.email, TEST_ADMIN_PASSWORD: USERS.admin.password });

    const statePath = await login(browser, { baseUrl: fixture.url, role: 'admin', stateDir: stateDir() });

    const { cookies } = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.ok(cookies.some((cookie) => cookie.name === 'sid'));
    assert.equal(path.basename(statePath), 'admin.json');
    assert.equal(fixture.logins.admin, 1);
  });

  test('two-step form: email, Continue, then password', async (t) => {
    withEnv(t, { TEST_USER_EMAIL: USERS.user.email, TEST_USER_PASSWORD: USERS.user.password });

    await login(browser, { baseUrl: fixture.url, role: 'user', stateDir: stateDir(), loginPath: '/login2' });

    assert.equal(fixture.logins.user, 1);
  });

  test('a wrong password fails at still-on-login and never echoes the password', async (t) => {
    withEnv(t, { TEST_ADMIN_EMAIL: USERS.admin.email, TEST_ADMIN_PASSWORD: 'wrong-fixture-pass' });

    await assert.rejects(
      login(browser, { baseUrl: fixture.url, role: 'admin', stateDir: stateDir() }),
      (error) => error instanceof LoginError && error.step === 'still-on-login' && !error.message.includes('wrong-fixture-pass'),
    );
  });

  test('a page without a login form fails at field-not-found', async (t) => {
    withEnv(t, { TEST_ADMIN_EMAIL: USERS.admin.email, TEST_ADMIN_PASSWORD: USERS.admin.password });

    await assert.rejects(
      login(browser, { baseUrl: fixture.url, role: 'admin', stateDir: stateDir(), loginPath: '/no-form' }),
      (error) => error instanceof LoginError && error.step === 'field-not-found',
    );
  });
});
