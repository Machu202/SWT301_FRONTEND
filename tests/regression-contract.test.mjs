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
  assert.match(app, /scan the displayed MB Bank QR code/);
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


test('product catalog remains visible when cart loading fails', () => {
  assert.match(app, /Product browsing remains available/);
  assert.match(app, /state\.cartLoadError/);
  assert.match(app, /Cart unavailable/);
});

test('checkout reports the exact failed dependency', () => {
  assert.match(app, /Checkout is temporarily unavailable/);
  assert.match(app, /Promise\.allSettled/);
});

test('receipt upload modal has preview, remove, drag-and-drop and guarded submit', () => {
  assert.match(app, /receipt-dropzone/);
  assert.match(app, /qr-file-preview-image/);
  assert.match(app, /data-testid="qr-file-remove"/);
  assert.match(app, /addEventListener\('drop'/);
  assert.match(app, /submit\.disabled = true/);
  assert.match(css, /\.receipt-upload-shell/);
  assert.match(css, /\.receipt-file-preview/);
});


test('Settings and Test Lab are removed for every role', () => {
  assert.doesNotMatch(app, /\['test-lab',\s*'⌁',\s*'Test Lab'\]/);
  assert.doesNotMatch(app, /\['settings',\s*'⚙',\s*'Settings'\]/);
  assert.doesNotMatch(app, /case 'test-lab'/);
  assert.doesNotMatch(app, /case 'settings'/);
  assert.match(app, /function ensureAllowedView\(\)/);
});


test('Profile removes the Account information panel and uses the redesigned single-card layout', () => {
  assert.doesNotMatch(app, />Account information</);
  assert.doesNotMatch(app, />Role validation</);
  assert.doesNotMatch(app, />User ID</);
  assert.match(app, /class="profile-page"/);
  assert.match(app, /class="card profile-card"/);
  assert.match(app, /class="profile-section"/);
  assert.match(css, /\.profile-page/);
  assert.match(css, /\.profile-actions/);
});


test('Customer and Admin screens use neutral business-facing language', () => {
  assert.match(app, /Customer Portal/);
  assert.match(app, /Admin Portal/);
  assert.match(app, /Store overview/);
  assert.match(app, /Welcome back/);
  assert.doesNotMatch(app, /Backend-connected frontend/);
  assert.doesNotMatch(app, /Functional Testing Client/);
  assert.doesNotMatch(app, /TEST WORKSPACE/);
  assert.doesNotMatch(app, /GET \/api\/reference\/categories/);
  assert.doesNotMatch(app, /Cloudinary image/);
  assert.doesNotMatch(api, /Cannot reach the backend/);
  assert.doesNotMatch(api, /Request failed with HTTP/);
});

test('Lab 1 inline address validation remains visible after blur', () => {
  assert.match(app, /function bindPhoneOnlyInput/);
  assert.match(app, /Phone number must be 10 digits/);
  assert.match(app, /function bindRequiredTextInput/);
  assert.match(app, /bindRequiredTextInput\([^;]+, 'Name'\)/);
});

test('Lab 1 QR modal exposes payment details and opens the receipt chooser directly', () => {
  assert.match(app, /Account number/);
  assert.match(app, /info\.accountNumber/);
  assert.match(app, /autoOpenFilePicker:\s*true/);
  assert.match(app, /qr-file-preview-image/);
});

test('Lab 1 order history has the required table and empty-state action', () => {
  assert.match(app, /data-testid="order-history-table"/);
  assert.match(app, /<th>Order ID<\/th><th>Date<\/th><th>Total<\/th><th>Status<\/th>/);
  assert.match(app, /You have no orders yet/);
  assert.match(app, /data-testid="continue-shopping"/);
});

test('Lab 1 admin recent orders include the receiver column', () => {
  assert.match(app, /admin \? '<th>Receiver<\/th>'/);
  assert.match(app, /order\.receiverName/);
});
