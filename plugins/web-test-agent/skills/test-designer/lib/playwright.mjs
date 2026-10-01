// playwright.mjs — load @playwright/test from the tester's work folder.
//
// The plugin's install folder has no node_modules, and the generated specs in
// artifacts/<host>/tests/ import '@playwright/test' from the work folder. Playwright refuses
// to run when the config and the specs load two different copies, so the work folder is
// tried first. The second root (this file's own location) only resolves in the development
// repo, where node_modules sits at the repo root.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const EXIT_NO_PLAYWRIGHT = 4;

/**
 * Return the @playwright/test module from the first of `roots` that has it installed.
 * Throws an Error with code 'PLAYWRIGHT_MISSING' when none does; any other load error
 * (a broken install) is rethrown as is.
 */
export function loadPlaywright(roots = [process.cwd(), HERE]) {
  for (const root of roots) {
    try {
      return createRequire(path.join(root, 'package.json'))('@playwright/test');
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  const error = new Error(`@playwright/test is not installed in ${roots.join(' or ')}`);
  error.code = 'PLAYWRIGHT_MISSING';
  throw error;
}

/** loadPlaywright for CLI scripts: a missing install prints one line and exits 4. */
export function playwrightOrExit(roots) {
  try {
    return loadPlaywright(roots);
  } catch (error) {
    if (error.code !== 'PLAYWRIGHT_MISSING') throw error;
    console.error('Chưa cài Playwright ở thư mục này. Hãy chạy skill "setup" của web-test-agent rồi thử lại.');
    process.exit(EXIT_NO_PLAYWRIGHT);
  }
}
