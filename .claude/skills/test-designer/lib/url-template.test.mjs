import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFileUrl, isUnsafe, normalizeUrl } from './url-template.mjs';

const BASE = 'https://app.test/orders/';

test('normalizeUrl resolves relative links, drops fragments and tracking, sorts the query', () => {
  assert.equal(normalizeUrl('42#top', BASE), 'https://app.test/orders/42');
  assert.equal(
    normalizeUrl('/list?b=2&utm_source=x&a=1&gclid=z&fbclid=y', BASE),
    'https://app.test/list?a=1&b=2',
  );
  assert.equal(normalizeUrl('https://app.test', BASE), 'https://app.test/');
});

test('normalizeUrl rejects other origins, non-http schemes and malformed hrefs', () => {
  for (const href of [
    'https://other.test/',
    'http://app.test/',
    'mailto:help@app.test',
    'tel:+84123',
    'javascript:alert(1)',
    'http://[',
  ]) {
    assert.equal(normalizeUrl(href, BASE), null, href);
  }
});

test('normalizeUrl treats "#" and "" as the current page', () => {
  assert.equal(normalizeUrl('#', 'https://app.test/a?x=1'), 'https://app.test/a?x=1');
  assert.equal(normalizeUrl('', 'https://app.test/a'), 'https://app.test/a');
});

test('isUnsafe blocks state-changing path segments', () => {
  for (const pathname of [
    '/logout',
    '/sign-out',
    '/items/5/delete',
    '/settings/delete-account',
    '/team/remove_member/3',
    '/reports/export.csv',
    '/remove-bg-tool',
  ]) {
    assert.equal(isUnsafe(`https://app.test${pathname}`), true, pathname);
  }
});

test('isUnsafe allows look-alike words', () => {
  for (const pathname of ['/', '/orders/42', '/deleted-items', '/tools/bg-remover', '/exports']) {
    assert.equal(isUnsafe(`https://app.test${pathname}`), false, pathname);
  }
});

test('isUnsafe blocks actions carried in the query string (Review Focus)', () => {
  assert.equal(isUnsafe('https://app.test/items/5?action=delete'), true);
  assert.equal(isUnsafe('https://app.test/items/5?_method=DELETE'), true);
  assert.equal(isUnsafe('https://app.test/items?sort=created'), false);
});

test('--exclude adds blocks; --allow reopens defaults but never overrides --exclude', () => {
  const filters = { exclude: [/\/billing/], allow: [/\/remove-bg-tool/, /\/billing/] };
  assert.equal(isUnsafe('https://app.test/billing/plans', filters), true);
  assert.equal(isUnsafe('https://app.test/remove-bg-tool', filters), false);
  assert.equal(isUnsafe('https://app.test/logout', filters), true);
});

test('isFileUrl recognises file extensions but not sitemap.xml or dotted folders', () => {
  assert.equal(isFileUrl('https://app.test/invoices/1042.PDF'), true);
  assert.equal(isFileUrl('https://app.test/data/export.csv?x=1'), true);
  assert.equal(isFileUrl('https://app.test/sitemap.xml'), false);
  assert.equal(isFileUrl('https://app.test/orders/42'), false);
  assert.equal(isFileUrl('https://app.test/v1.2/docs'), false);
});
