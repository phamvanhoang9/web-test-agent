// auth.mjs — log a role in through the site's own login form and save the session as a
// Playwright storageState, so the crawler can reuse it. Credentials come from env and are
// never printed: errors name the role and the failed step, nothing else.

import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SUBMIT = /sign in|log in|login|đăng nhập|continue|tiếp tục/i;
const EMAIL_LABEL = /email/i;
const PASSWORD_LABEL = /password|mật khẩu/i;
const STEP_TIMEOUT_MS = 10_000;

export class LoginError extends Error {
  constructor(role, step) {
    super(`login failed for role "${role}": ${step}`);
    this.name = 'LoginError';
    this.role = role;
    this.step = step;
  }
}

/** Env variable names holding a role's credentials. */
export function credentialVars(role) {
  const prefix = role === 'default' ? 'TEST' : `TEST_${role.toUpperCase()}`;
  return { email: `${prefix}_EMAIL`, password: `${prefix}_PASSWORD` };
}

/** Names of the credential variables that are unset or empty for any of `roles`. */
export function missingCredentials(roles, env = process.env) {
  return roles.flatMap((role) => Object.values(credentialVars(role))).filter((name) => !env[name]);
}

/**
 * Sign `role` in at `loginPath` and write <stateDir>/<role>.json. Fields are found by label
 * (inputs only, so a "Show password" button is never mistaken for the field). A two-step
 * form — email, Continue, then password — is handled. The submit button is looked for only
 * inside the field's own form, so "Sign in with Google" beside it is never pressed; with no
 * such button, Enter submits. Success means the URL has left `loginPath` on the same origin
 * and no password field is showing; anything else throws LoginError.
 */
export async function login(browser, { baseUrl, role, stateDir, loginPath = '/login' }) {
  const vars = credentialVars(role);
  const context = await browser.newContext({ baseURL: baseUrl });
  try {
    const page = await context.newPage();
    await page.goto(loginPath, { waitUntil: 'domcontentloaded' });
    const input = (label) => page.getByLabel(label).and(page.locator('input')).first();
    const submitFrom = async (field) => {
      const button = page.locator('form').filter({ has: field }).getByRole('button', { name: SUBMIT }).first();
      if (await button.count()) await button.click();
      else await field.press('Enter');
    };

    if (!(await input(EMAIL_LABEL).isVisible())) throw new LoginError(role, 'field-not-found');
    await input(EMAIL_LABEL).fill(process.env[vars.email]);
    if (!(await input(PASSWORD_LABEL).isVisible())) {
      await submitFrom(input(EMAIL_LABEL));
      await input(PASSWORD_LABEL)
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
        .catch(() => {
          throw new LoginError(role, 'field-not-found');
        });
    }
    await input(PASSWORD_LABEL).fill(process.env[vars.password]);
    await submitFrom(input(PASSWORD_LABEL));
    const origin = new URL(baseUrl).origin;
    await page
      .waitForURL((url) => url.origin === origin && url.pathname !== loginPath, {
        timeout: STEP_TIMEOUT_MS,
        waitUntil: 'domcontentloaded', // 'load' never fires if the landing page has a hung resource
      })
      .catch(() => {
        throw new LoginError(role, 'still-on-login');
      });
    if (await input(PASSWORD_LABEL).isVisible()) throw new LoginError(role, 'still-on-login');

    mkdirSync(stateDir, { recursive: true });
    const statePath = path.join(stateDir, `${role}.json`);
    await context.storageState({ path: statePath });
    return statePath;
  } finally {
    await context.close();
  }
}
