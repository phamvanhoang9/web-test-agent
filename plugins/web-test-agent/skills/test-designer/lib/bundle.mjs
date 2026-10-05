// bundle.mjs — where a target site's artifacts live, and how its credentials load.
//
// Every phase reads and writes artifacts/<host>/, so the host must be derived the same way
// everywhere: sanitized with /[^a-z0-9.-]/gi -> '_' (localhost:3000 -> localhost_3000).
// The same rule lives in test-runner/playwright.config.mjs and test-runner/report.mjs —
// change all three together.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/** Bundle folder name for a URL; WEBTEST_HOST overrides the derived host. */
export function hostOf(url) {
  return (process.env.WEBTEST_HOST || new URL(url).host).replace(/[^a-z0-9.-]/gi, '_');
}

/** artifacts/<host> for a URL, relative to the working directory. */
export function bundleDir(url) {
  return path.posix.join('artifacts', hostOf(url));
}

/**
 * Load <host>.env, then .env, from `root` into process.env without overwriting anything
 * already set. Precedence: shell > <host>.env > .env. Missing files are skipped.
 * The host comes first in the name because Windows reads the last dot-part as the file
 * type: .env.app.example.com would show up as a program.
 */
export function loadEnv(host, root = process.cwd()) {
  for (const name of [`${host}.env`, '.env']) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      process.env[key] ??= value;
    }
  }
}
