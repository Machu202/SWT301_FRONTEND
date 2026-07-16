import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/api.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('authentication keeps show/hide password controls', () => {
  assert.match(app, /data-testid="toggle-login-password"/);
  assert.match(app, /data-testid="toggle-register-password"/);
});

test('sessions use sessionStorage and validate JWT expiration', () => {
  assert.match(api, /sessionStorage\.setItem/);
  assert.match(api, /payload\.exp \* 1000 > Date\.now\(\)/);
  assert.doesNotMatch(api, /localStorage\.setItem/);
});

test('requests have timeout and view cancellation', () => {
  assert.match(api, /DEFAULT_TIMEOUT_MS/);
  assert.match(api, /new AbortController\(\)/);
  assert.match(api, /requestScope\.abort/);
});

test('reference IDs come from backend APIs', () => {
  assert.match(api, /\/api\/reference\/categories/);
  assert.match(api, /\/api\/reference\/payment-methods/);
  assert.match(api, /\/api\/reference\/order-statuses/);
});

test('products use 12-item pages and a multi-column responsive grid', () => {
  assert.match(app, /const PRODUCTS_PAGE_SIZE = 12/);
  assert.match(css, /\.products\s*\{[^}]*repeat\(4,minmax\(0,1fr\)\)/s);
});

test('address CRUD and manual checkout address remain available', () => {
  assert.match(api, /createAddress:/);
  assert.match(api, /updateAddress:/);
  assert.match(api, /deleteAddress:/);
  assert.match(app, /data-set-default-address/);
  assert.match(app, /data-delete-address/);
  assert.match(app, /manualAddress:\s*null/);
  assert.match(app, /address-mode-manual/);
});

test('QR views load authenticated backend image endpoints', () => {
  assert.match(api, /paymentQrCode:.*responseType:\s*'blob'/);
  assert.match(app, /exact configured MB Bank QR image/);
  assert.doesNotMatch(app, /img\.vietqr\.io/);
});

test('cart clear and confirmation protections remain', () => {
  assert.match(api, /clearCart:/);
  assert.match(app, /Clear cart/i);
  assert.match(app, /confirm\(/);
});

test('checkout keeps COD and QR radio controls', () => {
  assert.match(app, /type="radio" name="paymentMethodId"/);
  assert.match(app, /COD/);
  assert.match(app, /QR_CODE/);
});
