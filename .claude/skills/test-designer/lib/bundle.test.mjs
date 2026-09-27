import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundleDir, hostOf, loadEnv } from './bundle.mjs';

function withEnv(t, vars) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('hostOf sanitizes the port so localhost:3000 maps to localhost_3000', (t) => {
  withEnv(t, { WEBTEST_HOST: undefined });
  assert.equal(hostOf('http://localhost:3000/login'), 'localhost_3000');
});

test('WEBTEST_HOST overrides the derived host and is sanitized too', (t) => {
  withEnv(t, { WEBTEST_HOST: 'custom:8080' });
  assert.equal(hostOf('https://example.com'), 'custom_8080');
});

test('bundleDir is artifacts/<host> with forward slashes', (t) => {
  withEnv(t, { WEBTEST_HOST: undefined });
  assert.equal(bundleDir('https://example.com/a'), 'artifacts/example.com');
});

test('loadEnv precedence is shell > .env.<host> > .env', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'webtest-env-'));
  writeFileSync(path.join(root, '.env'), 'WT_BASE=base\nWT_HOST=base\nWT_SHELL=base\n');
  writeFileSync(path.join(root, '.env.example.com'), 'WT_HOST=host\nWT_SHELL=host\n');
  withEnv(t, { WT_BASE: undefined, WT_HOST: undefined, WT_SHELL: 'shell' });

  loadEnv('example.com', root);

  assert.equal(process.env.WT_BASE, 'base');
  assert.equal(process.env.WT_HOST, 'host');
  assert.equal(process.env.WT_SHELL, 'shell');
});

test('loadEnv skips files that do not exist', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'webtest-env-'));
  assert.doesNotThrow(() => loadEnv('nothing.test', root));
});
