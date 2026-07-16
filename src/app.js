import './styles.css';
import {
  api,
  getSession,
  saveSession,
  clearSession,
  getConfig,
  startRequestScope,
  cancelRequestScope,
  isApiLogEnabled
} from './api.js';
import { VIETNAM_PHONE_PATTERN, sanitizePhoneValue, isValidVietnamPhone } from './validation.js';

const app = document.querySelector('#app');

const state = {
  session: getSession(),
  view: 'dashboard',
  products: [],
  productPage: { page: 0, size: 12, totalElements: 0, totalPages: 0 },
  categories: [],
  cart: null,
  addresses: [],
  orders: [],
  ordersPage: { page: 0, size: 10, totalElements: 0, totalPages: 0 },
  adminOrders: [],
  adminOrdersPage: { page: 0, size: 10, totalElements: 0, totalPages: 0 },
  apiLogs: [],
  requestStatus: {},
  search: '',
  debouncedSearch: '',
  searchDebounceTimer: null,
  category: 'ALL',
  authTab: 'login',
  checkoutVoucher: '',
  checkoutPreview: null,
  checkoutPreviewVoucher: null,
  checkoutPreviewTimer: null,
  checkoutIdempotencyKey: null,
  paymentMethods: [],
  orderStatuses: [],
  profile: null,
  loginMode: 'username',
  paymentPollTimer: null,
  paymentPollFailures: 0
};

const VALID_ROLES = new Set(['ADMIN', 'CUSTOMER']);
const PRODUCTS_PAGE_SIZE = 12;
const role = () => String(state.session?.role || '').replace(/^ROLE_/i, '').trim().toUpperCase();
const hasValidRole = () => VALID_ROLES.has(role());
const isAdmin = () => role() === 'ADMIN';
const isCustomer = () => role() === 'CUSTOMER';


const CATEGORY_LABELS_EN = new Map([
  ['BÀN PHÍM CƠ', 'Mechanical Keyboards'],
  ['BAN PHIM CO', 'Mechanical Keyboards'],
  ['ĐIỆN THOẠI', 'Phones'],
  ['DIEN THOAI', 'Phones'],
  ['KEYCAP SETS & PHỤ KIỆN', 'Keycap Sets & Accessories'],
  ['KEYCAP SETS & PHU KIEN', 'Keycap Sets & Accessories'],
  ['PHỤ KIỆN', 'Accessories'],
  ['PHU KIEN', 'Accessories'],
  ['ĐIỆN TỬ', 'Electronics'],
  ['DIEN TU', 'Electronics'],
  ['NHÀ CỬA & ĐỜI SỐNG', 'Home & Living'],
  ['NHA CUA & DOI SONG', 'Home & Living']
]);

const PRODUCT_LABELS_EN = new Map([
  ['BỘ KEYCAP GENSHIN IMPACT THEME (FULL SET)', 'Genshin Impact Keycap Set (Full Set)'],
  ['BO KEYCAP GENSHIN IMPACT THEME (FULL SET)', 'Genshin Impact Keycap Set (Full Set)']
]);

function stripVietnameseMarks(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function englishCategoryName(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Uncategorized';
  return CATEGORY_LABELS_EN.get(normalizeName(raw))
    || CATEGORY_LABELS_EN.get(normalizeName(stripVietnameseMarks(raw)))
    || raw;
}

function englishProductName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return PRODUCT_LABELS_EN.get(normalizeName(raw))
    || PRODUCT_LABELS_EN.get(normalizeName(stripVietnameseMarks(raw)))
    || raw;
}

function productCategoryChoices() {
  return [...state.categories]
    .filter((category) => Number.isInteger(Number(category.categoryId)))
    .map((category) => ({ categoryId: Number(category.categoryId), rawName: String(category.categoryName || '') }))
    .sort((a, b) => englishCategoryName(a.rawName).localeCompare(englishCategoryName(b.rawName), 'en'));
}

function bindPhoneOnlyInput(input) {
  if (!input) return;
  const validate = () => {
    const value = input.value.trim();
    input.setCustomValidity(value && !isValidVietnamPhone(value)
      ? 'Use exactly 10 digits beginning with 03, 05, 07, 08 or 09, or use +84 instead of the leading 0.'
      : '');
  };
  input.addEventListener('input', () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = sanitizePhoneValue(input.value);
    validate();
    if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
  input.addEventListener('blur', validate);
  validate();
}

function stopPaymentPolling() {
  if (state.paymentPollTimer) clearInterval(state.paymentPollTimer);
  state.paymentPollTimer = null;
  state.paymentPollFailures = 0;
}

function resetAuthenticatedState() {
  stopPaymentPolling();
  cancelRequestScope();
  clearTimeout(state.searchDebounceTimer);
  clearTimeout(state.checkoutPreviewTimer);
  closeModal();
  state.session = null;
  state.view = 'dashboard';
  state.products = [];
  state.productPage = { page: 0, size: 12, totalElements: 0, totalPages: 0 };
  state.categories = [];
  state.cart = null;
  state.addresses = [];
  state.orders = [];
  state.ordersPage = { page: 0, size: 10, totalElements: 0, totalPages: 0 };
  state.adminOrders = [];
  state.adminOrdersPage = { page: 0, size: 10, totalElements: 0, totalPages: 0 };
  state.apiLogs = [];
  state.requestStatus = {};
  state.search = '';
  state.debouncedSearch = '';
  state.category = 'ALL';
  state.checkoutVoucher = '';
  state.checkoutPreview = null;
  state.checkoutPreviewVoucher = null;
  state.checkoutIdempotencyKey = null;
  state.paymentMethods = [];
  state.orderStatuses = [];
  state.profile = null;
  state.paymentPollFailures = 0;
  document.querySelector('.toast-container')?.remove();
}

function normalizeName(value) {
  return String(value || '').trim().toUpperCase();
}

function canonicalPaymentMethodName(value) {
  const normalized = normalizeName(value)
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (['COD', 'CASH_ON_DELIVERY', 'CASH_DELIVERY', 'CASH'].includes(normalized) || normalized.startsWith('COD_')) return 'COD';
  if (['QR', 'QR_CODE', 'QRCODE', 'QR_PAYMENT', 'ONLINE_QR'].includes(normalized) || normalized.startsWith('QR_') || normalized.includes('QRCODE')) return 'QR_CODE';
  return normalized;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleString('vi-VN');
}

function statusBadge(status, label = '') {
  const normalized = normalizeName(status);
  let className = 'badge';
  if (['PAID', 'DELIVERED', 'ACTIVE'].includes(normalized)) className += ' badge-green';
  else if (['FAILED', 'CANCELLED', 'INACTIVE'].includes(normalized)) className += ' badge-red';
  else if (['PENDING', 'AWAITING_PAYMENT', 'PENDING_VERIFICATION', 'PROCESSING'].includes(normalized)) className += ' badge-orange';
  else className += ' badge-blue';
  const prefix = label ? `${label}: ` : '';
  return `<span class="${className}">${escapeHtml(prefix + (status || 'N/A'))}</span>`;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function toast(message, type = 'success', title = type === 'success' ? 'Success' : 'Error') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<div>${type === 'success' ? '✓' : '!'}</div><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  container.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

function setBusy(button, busy, text = 'Processing...') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || button.innerHTML;
  }
}

function loading(message = 'Loading data...') {
  return `<div class="loading"><div class="spinner"></div>${escapeHtml(message)}</div>`;
}

function empty(title, text) {
  return `<div class="empty"><strong>${escapeHtml(title)}</strong>${escapeHtml(text)}</div>`;
}

function requestMetric(icon, label, value, requestKey) {
  const result = state.requestStatus[requestKey];
  if (result?.ok === false) {
    return `<div class="card metric metric-error"><div class="metric-icon">!</div><div><span>${escapeHtml(label)}</span><strong>Unavailable</strong><small>${escapeHtml(result.error || 'Request failed')}</small></div></div>`;
  }
  return metric(icon, label, value);
}

function recordRequestStatus(key, result) {
  state.requestStatus[key] = result.status === 'fulfilled'
    ? { ok: true, error: '' }
    : { ok: false, error: result.reason?.message || 'Request failed' };
}

function paginationMarkup(pageInfo, prefix) {
  const totalPages = Number(pageInfo?.totalPages || 0);
  if (totalPages <= 1) return '';
  const page = Number(pageInfo.page || 0);
  return `<div class="pagination">
    <button class="btn btn-secondary btn-sm" data-page-action="${prefix}:prev" ${page <= 0 ? 'disabled' : ''}>Previous</button>
    <span>Page ${page + 1} of ${totalPages} · ${Number(pageInfo.totalElements || 0)} record(s)</span>
    <button class="btn btn-secondary btn-sm" data-page-action="${prefix}:next" ${page + 1 >= totalPages ? 'disabled' : ''}>Next</button>
  </div>`;
}

function bindPagination(container, prefix, pageInfo, onChange) {
  container.querySelectorAll(`[data-page-action^="${prefix}:"]`).forEach((button) => {
    button.addEventListener('click', () => {
      const direction = button.dataset.pageAction.split(':')[1];
      const nextPage = direction === 'next' ? pageInfo.page + 1 : pageInfo.page - 1;
      onChange(Math.max(0, nextPage));
    });
  });
}

function createIdempotencyKey() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validateImageFile(file, label = 'Image') {
  if (!file) return null;
  const allowedTypes = new Set(['image/jpeg', 'image/png']);
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!allowedTypes.has(file.type) || !['jpg', 'jpeg', 'png'].includes(extension)) {
    return `${label} must be a real JPG or PNG file.`;
  }
  if (file.size > 5 * 1024 * 1024) return `${label} must not exceed 5 MB.`;
  return null;
}

function fileDetailsMarkup(file) {
  if (!file) return '';
  return `<div class="file-preview-meta"><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(file.type || 'Unknown type')} · ${(file.size / 1024).toFixed(1)} KB</span></div>`;
}

function showBlobImageModal(blob, title) {
  const objectUrl = URL.createObjectURL(blob);
  showModal({ title, body: `<img class="receipt-image" src="${objectUrl}" alt="${escapeHtml(title)}" />` });
  const modal = document.querySelector('#active-modal');
  const revoke = () => URL.revokeObjectURL(objectUrl);
  modal?.addEventListener('click', (event) => {
    if (event.target.matches('[data-close-modal], .modal-backdrop')) revoke();
  }, { once: true });
}

function showModal({ title, body, footer = '', large = false }) {
  closeModal();
  const wrapper = document.createElement('div');
  wrapper.className = 'modal-backdrop';
  wrapper.id = 'active-modal';
  wrapper.innerHTML = `
    <section class="modal ${large ? 'modal-lg' : ''}" role="dialog" aria-modal="true">
      <header class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="btn btn-secondary icon-btn" data-close-modal aria-label="Close">×</button>
      </header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}
    </section>`;
  document.body.appendChild(wrapper);
  wrapper.addEventListener('click', (event) => {
    if (event.target === wrapper || event.target.closest('[data-close-modal]')) closeModal();
  });
}

function closeModal() {
  const modal = document.querySelector('#active-modal');
  const objectUrl = modal?.dataset.objectUrl;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  modal?.remove();
}

function navItems() {
  if (isAdmin()) {
    return [
      ['dashboard', '▦', 'Dashboard'],
      ['admin-products', '□', 'Products'],
      ['admin-orders', '≡', 'Orders'],
      ['profile', '●', 'Profile'],
      ['test-lab', '⌁', 'Test Lab'],
      ['settings', '⚙', 'Settings']
    ];
  }
  return [
    ['dashboard', '▦', 'Dashboard'],
    ['products', '□', 'Products'],
    ['cart', '🛒', 'Cart'],
    ['addresses', '⌂', 'Addresses'],
    ['checkout', '✓', 'Checkout'],
    ['orders', '≡', 'My Orders'],
    ['profile', '●', 'Profile'],
    ['test-lab', '⌁', 'Test Lab'],
    ['settings', '⚙', 'Settings']
  ];
}

const viewTitles = {
  dashboard: ['Dashboard', 'Live overview from the connected backend'],
  products: ['Product Catalog', 'Search products and test cart operations'],
  cart: ['Shopping Cart', 'Update quantities, remove items, and validate totals'],
  addresses: ['Delivery Addresses', 'Create and update customer shipping information'],
  checkout: ['Checkout', 'Preview voucher pricing and create an order'],
  orders: ['My Orders', 'Review order and payment workflow states'],
  'admin-products': ['Product Management', 'Create, update, and delete products'],
  'admin-orders': ['Order Administration', 'Update order and payment statuses'],
  profile: ['My Profile', 'View account details and update full name or phone number'],
  'test-lab': ['Software Test Lab', 'Run API checks and inspect request/response evidence'],
  settings: ['Environment Settings', 'View the fixed API endpoint and safe testing defaults']
};

function renderAuth() {
  // Authentication requests need a fresh scope after logout, 401, or a failed login.
  startRequestScope();
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-side">
        <div>
          <div class="brand">
            <div class="brand-mark">S</div>
            <div><h1>SWT301 Commerce</h1><p>Functional Testing Client</p></div>
          </div>
          <h1>A real frontend for testing every implemented backend workflow.</h1>
          <p>This client uses the actual Spring Boot API. It includes deterministic controls, field validation, role-based screens, and a built-in request log for test evidence.</p>
          <div class="feature-list">
            <div class="feature-row">✓ Customer and Admin role separation</div>
            <div class="feature-row">✓ Cart, voucher, checkout, payment, and order workflows</div>
            <div class="feature-row">✓ Stable data-testid selectors for automation</div>
            <div class="feature-row">✓ No mock product or order data</div>
          </div>
        </div>
        <p>Backend expected at <strong>http://localhost:8080</strong> · Frontend runs at <strong>http://localhost:5173</strong></p>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand" style="color:#172033;padding:0;margin-bottom:28px">
            <div class="brand-mark" style="color:white">S</div>
            <div><h1>SWT301 Test Client</h1><p>Backend-connected frontend</p></div>
          </div>
          <h2>${state.authTab === 'login' ? 'Welcome back' : 'Create a customer account'}</h2>
          <p>${state.authTab === 'login' ? 'Sign in with a backend account to begin testing.' : 'Registration always creates a CUSTOMER account.'}</p>
          <div class="tabs">
            <button class="tab ${state.authTab === 'login' ? 'active' : ''}" data-auth-tab="login">Login</button>
            <button class="tab ${state.authTab === 'register' ? 'active' : ''}" data-auth-tab="register">Register</button>
          </div>
          ${state.authTab === 'login' ? loginForm() : registerForm()}
          <div class="card card-pad" style="margin-top:18px;box-shadow:none;background:#f8fafc">
            <strong style="font-size:12px">Connection check</strong>
            <p class="help" style="margin:6px 0 12px">Tests the public <code>GET /api/products</code> endpoint.</p>
            <button class="btn btn-secondary btn-sm" id="connection-check" data-testid="connection-check">Check backend</button>
          </div>
        </div>
      </section>
    </main>`;
  bindAuthEvents();
}

function loginForm() {
  return `
    <form id="login-form" data-testid="login-form">
      <div class="form-grid">
        <div class="field">
          <label for="login-mode">Login method</label>
          <select class="select" id="login-mode" name="loginMode" data-testid="login-mode">
            <option value="username" ${state.loginMode === 'username' ? 'selected' : ''}>Username</option>
            <option value="phone" ${state.loginMode === 'phone' ? 'selected' : ''}>Vietnamese phone</option>
          </select>
        </div>
        <div class="field">
          <label for="login-identifier">${state.loginMode === 'phone' ? 'Phone number' : 'Username'}</label>
          <input class="input" id="login-identifier" name="identifier" required
            ${state.loginMode === 'phone' ? `type="tel" inputmode="tel" maxlength="12" pattern="${VIETNAM_PHONE_PATTERN}" placeholder="0912345678 or +84912345678"` : 'autocomplete="username" minlength="3" maxlength="50"'}
            data-testid="login-identifier" />
          ${state.loginMode === 'phone' ? '<p class="help">Only digits and an optional leading + are accepted.</p>' : ''}
        </div>
      </div>
      <div class="field" style="margin-top:14px">
        <label for="login-password">Password</label>
        <div class="password-input-wrap">
          <input class="input" id="login-password" name="password" type="password" required autocomplete="current-password" data-testid="login-password" />
          <button class="btn btn-secondary password-toggle" type="button" id="toggle-login-password" aria-pressed="false" data-testid="toggle-login-password">Show</button>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:20px" type="submit" data-testid="login-submit">Login</button>
    </form>`;
}

function registerForm() {
  return `
    <form id="register-form" data-testid="register-form">
      <input type="hidden" name="role" value="CUSTOMER" />
      <div class="form-grid">
        <div class="field"><label>Username</label><input class="input" name="username" minlength="3" maxlength="50" required data-testid="register-username" /></div>
        <div class="field"><label>Full name</label><input class="input" name="fullName" maxlength="100" required data-testid="register-full-name" /></div>
        <div class="field"><label>Email</label><input class="input" name="email" type="email" required data-testid="register-email" /></div>
        <div class="field"><label>Vietnamese phone</label><input class="input" id="register-phone" name="phone" type="tel" inputmode="tel" maxlength="12" pattern="${VIETNAM_PHONE_PATTERN}" placeholder="0912345678 or +84912345678" required data-testid="register-phone" /><p class="help">Accepted: 10-digit local number or +84 format. Letters are blocked.</p></div>
      </div>
      <div class="field" style="margin-top:14px">
        <label>Password</label>
        <div class="password-input-wrap">
          <input class="input" id="register-password" name="password" type="password" minlength="6" maxlength="40" required data-testid="register-password" />
          <button class="btn btn-secondary password-toggle" type="button" id="toggle-register-password" aria-pressed="false" data-testid="toggle-register-password">Show</button>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:20px" type="submit" data-testid="register-submit">Register customer</button>
    </form>`;
}

function bindAuthEvents() {
  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.authTab = button.dataset.authTab;
      renderAuth();
    });
  });

  const loginMode = document.querySelector('#login-mode');
  loginMode?.addEventListener('change', () => {
    state.loginMode = loginMode.value;
    renderAuth();
  });
  if (state.loginMode === 'phone') bindPhoneOnlyInput(document.querySelector('#login-identifier'));
  bindPhoneOnlyInput(document.querySelector('#register-phone'));

  document.querySelector('#toggle-login-password')?.addEventListener('click', (event) => {
    const passwordInput = document.querySelector('#login-password');
    const showPassword = passwordInput.type === 'password';
    passwordInput.type = showPassword ? 'text' : 'password';
    event.currentTarget.textContent = showPassword ? 'Hide' : 'Show';
    event.currentTarget.setAttribute('aria-pressed', String(showPassword));
    passwordInput.focus();
  });

  document.querySelector('#toggle-register-password')?.addEventListener('click', (event) => {
    const passwordInput = document.querySelector('#register-password');
    const showPassword = passwordInput.type === 'password';
    passwordInput.type = showPassword ? 'text' : 'password';
    event.currentTarget.textContent = showPassword ? 'Hide' : 'Show';
    event.currentTarget.setAttribute('aria-pressed', String(showPassword));
    passwordInput.focus();
  });

  document.querySelector('#connection-check')?.addEventListener('click', async (event) => {
    setBusy(event.currentTarget, true, 'Checking...');
    try {
      const products = await api.productsPage({ page: 0, size: 1 });
      toast(`Backend is reachable. ${products.totalElements || 0} active product(s) available.`);
    } catch (error) {
      toast(error.message, 'error', 'Connection failed');
    } finally {
      setBusy(event.currentTarget, false);
    }
  });

  document.querySelector('#login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const data = new FormData(event.currentTarget);
    setBusy(button, true, 'Signing in...');
    try {
      const identifier = data.get('identifier').trim();
      if (state.loginMode === 'phone' && !isValidVietnamPhone(identifier)) {
        throw new Error('Phone must be 0xxxxxxxxx or +84xxxxxxxxx.');
      }
      const response = await api.login(identifier, data.get('password'));
      resetAuthenticatedState();
      const session = {
        token: response.token,
        id: response.id,
        username: response.username,
        email: response.email,
        role: response.role
      };
      state.session = session;
      if (!hasValidRole()) {
        state.session = null;
        clearSession();
        throw new Error('The account role is invalid and cannot be opened as CUSTOMER.');
      }
      saveSession(session);
      state.view = 'dashboard';
      toast(`Logged in as ${session.username}.`);
      renderShell();
    } catch (error) {
      clearSession();
      resetAuthenticatedState();
      toast(error.message, 'error', 'Login failed');
    } finally {
      setBusy(button, false);
    }
  });

  document.querySelector('#register-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries());
    payload.phone = sanitizePhoneValue(payload.phone);
    if (!isValidVietnamPhone(payload.phone)) {
      return toast('Phone must be 0xxxxxxxxx or +84xxxxxxxxx.', 'error', 'Invalid phone');
    }
    setBusy(button, true, 'Registering...');
    try {
      const response = await api.register(payload);
      toast(response.message || 'Registration completed.');
      state.authTab = 'login';
      renderAuth();
      setTimeout(() => {
        const identifier = document.querySelector('#login-identifier');
        if (identifier) identifier.value = payload.username;
      }, 0);
    } catch (error) {
      toast(error.message, 'error', 'Registration failed');
    } finally {
      setBusy(button, false);
    }
  });
}

function renderShell() {
  if (!state.session) return renderAuth();
  if (!hasValidRole()) {
    clearSession();
    resetAuthenticatedState();
    renderAuth();
    return toast('This account has an invalid role. Access was blocked instead of defaulting to CUSTOMER.', 'error', 'Invalid role');
  }
  const [title, subtitle] = viewTitles[state.view] || viewTitles.dashboard;
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-mark">S</div>
          <div><h1>SWT301 Commerce</h1><p>Testing Client</p></div>
        </div>
        <nav class="nav-list">
          ${navItems().map(([id, icon, label]) => `
            <button class="nav-btn ${state.view === id ? 'active' : ''}" data-view="${id}" data-testid="nav-${id}">
              <span>${icon}</span><span>${label}</span>
            </button>`).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="user-mini">
            <strong>${escapeHtml(state.session.username)}</strong>
            <span>${escapeHtml(role())} · ${escapeHtml(state.session.email || '')}</span>
          </div>
          <button class="btn btn-ghost" id="logout-button" data-testid="logout-button">Logout</button>
        </div>
      </aside>
      <section class="main">
        <header class="topbar">
          <div style="display:flex;align-items:center;gap:12px">
            <button class="btn btn-secondary icon-btn mobile-menu" id="mobile-menu">☰</button>
            <div class="topbar-title"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>
          </div>
          <div class="topbar-actions">
            <span class="badge badge-blue hide-mobile">${escapeHtml(role())}</span>
            <button class="btn btn-secondary btn-sm" id="refresh-view" data-testid="refresh-view">↻ Refresh</button>
          </div>
        </header>
        <div class="content" id="view-content">${loading()}</div>
      </section>
    </div>`;
  bindShellEvents();
  renderCurrentView();
}

function bindShellEvents() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      stopPaymentPolling();
      cancelRequestScope();
      state.view = button.dataset.view;
      renderShell();
    });
  });
  document.querySelector('#logout-button').addEventListener('click', () => {
    clearSession();
    resetAuthenticatedState();
    renderAuth();
  });
  document.querySelector('#mobile-menu').addEventListener('click', () => {
    document.querySelector('#sidebar').classList.toggle('open');
  });
  document.querySelector('#refresh-view').addEventListener('click', () => renderCurrentView(true));
}

async function renderCurrentView(force = false) {
  const container = document.querySelector('#view-content');
  if (!container) return;
  if (state.view !== 'orders') stopPaymentPolling();
  startRequestScope();
  container.innerHTML = loading();
  try {
    switch (state.view) {
      case 'dashboard': await renderDashboard(container); break;
      case 'products': await renderProducts(container, false, force); break;
      case 'cart': await renderCart(container, force); break;
      case 'addresses': await renderAddresses(container, force); break;
      case 'checkout': await renderCheckout(container, force); break;
      case 'orders': await renderOrders(container, force); break;
      case 'admin-products': await renderProducts(container, true, force); break;
      case 'admin-orders': await renderAdminOrders(container, force); break;
      case 'profile': await renderProfile(container, force); break;
      case 'test-lab': renderTestLab(container); break;
      case 'settings': renderSettings(container); break;
      default: await renderDashboard(container);
    }
  } catch (error) {
    if (error.cancelled || error.status === 401 || error.authExpired) return;
    container.innerHTML = `<div class="card card-pad">${empty('Unable to load this screen', error.message)}</div>`;
  }
}

async function renderDashboard(container) {
  state.requestStatus = {};
  if (isAdmin()) {
    const [productsResult, ordersResult, metricsResult] = await Promise.allSettled([
      api.adminProductsPage({ page: 0, size: 5 }),
      api.adminOrdersPage({ page: 0, size: 5 }),
      api.adminOrderMetrics()
    ]);
    if (state.view !== 'dashboard' || !container.isConnected) return;
    recordRequestStatus('products', productsResult);
    recordRequestStatus('adminOrders', ordersResult);
    recordRequestStatus('adminMetrics', metricsResult);
    if (productsResult.status === 'fulfilled') {
      state.products = productsResult.value.content || [];
    }
    if (ordersResult.status === 'fulfilled') {
      state.adminOrders = ordersResult.value.content || [];
    }
    const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value : null;
    const revenue = Number(metrics?.paidRevenue || 0);
    const pendingPayments = Number(metrics?.paymentsPendingVerification || 0);
    container.innerHTML = `
      <section class="hero">
        <div><span class="badge">ADMIN TEST WORKSPACE</span><h2>System control and verification</h2><p>Manage products, inspect orders, approve QR payments, and capture redacted API evidence.</p></div>
        <button class="btn btn-primary" data-go="admin-orders">Review orders</button>
      </section>
      <div class="grid grid-4">
        ${requestMetric('□', 'Products', productsResult.status === 'fulfilled' ? productsResult.value.totalElements : '—', 'products')}
        ${requestMetric('≡', 'Total orders', metrics ? metrics.totalOrders : '—', 'adminMetrics')}
        ${requestMetric('₫', 'Paid revenue', money(revenue), 'adminMetrics')}
        ${requestMetric('!', 'Payments to verify', pendingPayments, 'adminMetrics')}
      </div>
      <div class="grid grid-2" style="margin-top:18px">
        <section class="card"><div class="card-header"><div><h3>Recent orders</h3><p>Most recent backend records</p></div></div>${state.requestStatus.adminOrders?.ok ? ordersTable(state.adminOrders.slice(0, 5), true) : empty('Orders unavailable', state.requestStatus.adminOrders?.error || 'Request failed')}</section>
        <section class="card card-pad"><h3 style="margin-top:0">Testing readiness</h3>${readinessList()}</section>
      </div>`;
  } else {
    const [productsResult, cartResult, ordersResult, addressesResult] = await Promise.allSettled([
      api.productsPage({ page: 0, size: 1 }),
      api.cart(),
      api.ordersPage({ page: 0, size: 5 }),
      api.addresses()
    ]);
    if (state.view !== 'dashboard' || !container.isConnected) return;
    recordRequestStatus('products', productsResult);
    recordRequestStatus('cart', cartResult);
    recordRequestStatus('orders', ordersResult);
    recordRequestStatus('addresses', addressesResult);
    if (productsResult.status === 'fulfilled') state.productPage = productsResult.value;
    if (cartResult.status === 'fulfilled') state.cart = cartResult.value;
    if (ordersResult.status === 'fulfilled') {
      state.orders = ordersResult.value.content || [];
      state.ordersPage = ordersResult.value;
    }
    if (addressesResult.status === 'fulfilled') state.addresses = addressesResult.value;
    const cartQuantity = (state.cart?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    container.innerHTML = `
      <section class="hero">
        <div><span class="badge">CUSTOMER TEST WORKSPACE</span><h2>Test the full purchase journey</h2><p>Each dashboard area reports its own API failure instead of silently showing zero.</p></div>
        <button class="btn btn-primary" data-go="products">Browse products</button>
      </section>
      <div class="grid grid-4">
        ${requestMetric('□', 'Products', productsResult.status === 'fulfilled' ? productsResult.value.totalElements : '—', 'products')}
        ${requestMetric('🛒', 'Cart quantity', cartQuantity, 'cart')}
        ${requestMetric('⌂', 'Addresses', state.addresses.length, 'addresses')}
        ${requestMetric('≡', 'Orders', ordersResult.status === 'fulfilled' ? ordersResult.value.totalElements : '—', 'orders')}
      </div>
      <div class="grid grid-2" style="margin-top:18px">
        <section class="card"><div class="card-header"><div><h3>Recent orders</h3><p>Your latest backend orders</p></div></div>${state.requestStatus.orders?.ok ? ordersTable(state.orders, false) : empty('Orders unavailable', state.requestStatus.orders?.error || 'Request failed')}</section>
        <section class="card card-pad"><h3 style="margin-top:0">Current cart</h3>${state.requestStatus.cart?.ok ? `<p class="help">${cartQuantity} total unit(s) across ${state.cart?.items?.length || 0} distinct product(s) · ${money(state.cart?.totalCartPrice)}</p><button class="btn btn-secondary" data-go="cart">Open cart</button>` : empty('Cart unavailable', state.requestStatus.cart?.error || 'Request failed')}</section>
      </div>`;
  }
  container.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => {
    cancelRequestScope();
    state.view = button.dataset.go;
    renderShell();
  }));
}

function metric(icon, label, value) {
  return `<div class="card metric"><div class="metric-icon">${icon}</div><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></div>`;
}

function readinessList() {
  const checks = [
    ['Authentication', Boolean(state.session?.token)],
    ['Product endpoint', state.requestStatus.products?.ok === true],
    ['Admin order endpoint', state.requestStatus.adminOrders?.ok === true],
    ['Redacted API evidence', isApiLogEnabled()]
  ];
  return checks.map(([label, pass]) => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span>${label}</span>${statusBadge(pass ? 'READY' : 'FAILED')}</div>`).join('');
}

async function loadProducts(force = false, adminMode = false) {
  if (force || !state.categories.length) state.categories = await api.categories();
  const page = Number(state.productPage.page || 0);
  const params = {
    page,
    size: PRODUCTS_PAGE_SIZE,
    search: state.debouncedSearch,
    categoryId: state.category === 'ALL' ? null : Number(state.category)
  };
  const response = adminMode ? await api.adminProductsPage(params) : await api.productsPage(params);
  state.products = response.content || [];
  state.productPage = { ...response, size: PRODUCTS_PAGE_SIZE };
  return state.products;
}

async function renderProducts(container, adminMode = false, force = false) {
  await loadProducts(force, adminMode);
  if (!adminMode && (force || !state.cart)) state.cart = await api.cart();
  const categories = productCategoryChoices();
  container.innerHTML = `
    <div class="toolbar">
      <div class="field"><input class="input" id="product-search" placeholder="Search name or description" value="${escapeHtml(state.search)}" data-testid="product-search" /></div>
      <select class="select" id="category-filter" style="max-width:260px" data-testid="category-filter">
        <option value="ALL">All categories</option>
        ${categories.map((category) => `<option value="${category.categoryId}" ${String(state.category) === String(category.categoryId) ? 'selected' : ''}>${escapeHtml(englishCategoryName(category.rawName))}</option>`).join('')}
      </select>
      ${adminMode ? '<button class="btn btn-primary" id="create-product" data-testid="create-product">+ New product</button>' : ''}
    </div>
    ${state.products.length ? `<div class="products">${state.products.map((product) => {
      const inCart = state.cart?.items?.find((item) => Number(item.productId) === Number(product.productId))?.quantity || 0;
      const available = Math.max(0, Number(product.stock || 0) - inCart);
      return productCard(product, adminMode, available, inCart);
    }).join('')}</div>` : `<div class="card">${empty('No products found', 'Adjust the search or category filter.')}</div>`}
    ${paginationMarkup(state.productPage, 'products')}`;

  document.querySelector('#product-search').addEventListener('input', (event) => {
    state.search = event.target.value;
    clearTimeout(state.searchDebounceTimer);
    state.searchDebounceTimer = setTimeout(() => {
      state.debouncedSearch = state.search.trim();
      state.productPage.page = 0;
      renderProducts(container, adminMode, false).catch((error) => !error.cancelled && toast(error.message, 'error'));
    }, 250);
  });
  document.querySelector('#category-filter').addEventListener('change', (event) => {
    state.category = event.target.value;
    state.productPage.page = 0;
    renderProducts(container, adminMode, false).catch((error) => !error.cancelled && toast(error.message, 'error'));
  });
  bindPagination(container, 'products', state.productPage, (page) => {
    state.productPage.page = page;
    renderProducts(container, adminMode, false);
  });
  if (adminMode) bindAdminProductActions(container);
  else bindCustomerProductActions(container);
}

function productCard(product, adminMode, available = Number(product.stock || 0), inCart = 0) {
  const active = normalizeName(product.status || 'ACTIVE') === 'ACTIVE';
  const image = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.productName)}" onerror="this.parentElement.innerHTML='No image'" />`
    : 'No image';
  return `
    <article class="card product-card ${active ? '' : 'product-inactive'}" data-testid="product-card-${product.productId}">
      <div class="product-image">${image}</div>
      <div class="product-body">
        <div><span class="badge badge-blue">${escapeHtml(englishCategoryName(product.categoryName || `Category ${product.categoryId}`))}</span>${adminMode ? ` ${statusBadge(product.status || 'ACTIVE')}` : ''}</div>
        <h3>${escapeHtml(englishProductName(product.productName))}</h3>
        <p>${escapeHtml(product.description || 'No description')}</p>
        <div class="product-meta"><span class="price">${money(product.price)}</span><span class="stock">${adminMode ? `Stock: ${escapeHtml(product.stock)}` : `Available: ${escapeHtml(available)}${inCart ? ` · In cart: ${escapeHtml(inCart)}` : ''}`}</span></div>
        ${adminMode ? `
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" data-edit-product="${product.productId}" data-testid="edit-product-${product.productId}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-product="${product.productId}" data-testid="delete-product-${product.productId}" ${active ? '' : 'disabled'}>${active ? 'Deactivate' : 'Inactive'}</button>
          </div>` : `
          <div class="product-actions">
            <input class="input" type="number" min="1" max="${Math.max(1, available)}" value="1" id="qty-${product.productId}" aria-label="Quantity" data-testid="quantity-${product.productId}" ${available < 1 ? 'disabled' : ''} />
            <button class="btn btn-primary" data-add-product="${product.productId}" data-available="${available}" ${available < 1 ? 'disabled' : ''} data-testid="add-cart-${product.productId}">${available < 1 ? 'No more available' : 'Add to cart'}</button>
          </div>`}
      </div>
    </article>`;
}

function bindCustomerProductActions(container) {
  container.querySelectorAll('[data-add-product]').forEach((button) => {
    button.addEventListener('click', async () => {
      const productId = Number(button.dataset.addProduct);
      const quantityInput = document.querySelector(`#qty-${productId}`);
      const quantity = Number(quantityInput.value);
      const available = Number(button.dataset.available);
      if (!Number.isInteger(quantity) || quantity < 1) return toast('Quantity must be an integer greater than 0.', 'error');
      if (quantity > available) return toast(`Only ${available} more item(s) can be added.`, 'error');
      setBusy(button, true, 'Adding...');
      try {
        state.cart = await api.addCartItem(productId, quantity);
        state.checkoutPreview = null;
        state.checkoutPreviewVoucher = null;
        toast('Product added. Available stock now reflects the quantity reserved in your cart.');
        await renderProducts(container, false, false);
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        setBusy(button, false);
      }
    });
  });
}

function bindAdminProductActions(container) {
  document.querySelector('#create-product')?.addEventListener('click', () => openProductModal());
  container.querySelectorAll('[data-edit-product]').forEach((button) => {
    button.addEventListener('click', () => openProductModal(state.products.find((p) => Number(p.productId) === Number(button.dataset.editProduct))));
  });
  container.querySelectorAll('[data-delete-product]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = Number(button.dataset.deleteProduct);
      const product = state.products.find((p) => Number(p.productId) === id);
      if (!confirm(`Deactivate "${product?.productName || id}"? It will disappear from the customer catalog and its Cloudinary image will be removed.`)) return;
      setBusy(button, true, 'Deactivating...');
      try {
        const response = await api.deleteProduct(id);
        toast(response.message || 'Product deactivated.');
        await renderProducts(container, true, true);
      } catch (error) {
        if (!error.cancelled) toast(error.message, 'error');
        setBusy(button, false);
      }
    });
  });
}

function openProductModal(product = null) {
  const categories = productCategoryChoices();
  if (!categories.length) {
    return toast('No categories were returned by GET /api/reference/categories. Create a category in the database before managing products.', 'error');
  }
  const selectedCategoryId = product ? Number(product.categoryId) : null;
  showModal({
    title: product ? 'Edit product' : 'Create product',
    body: `
      <form id="product-form" data-testid="product-form">
        <div class="form-grid">
          <div class="field"><label>Category</label><select class="select" name="categoryId" required data-testid="product-category-id">
            <option value="" disabled ${selectedCategoryId === null ? 'selected' : ''}>Select a category</option>
            ${categories.map((category) => `<option value="${category.categoryId}" ${category.categoryId === selectedCategoryId ? 'selected' : ''}>${escapeHtml(englishCategoryName(category.rawName))}</option>`).join('')}
          </select></div>
          <div class="field"><label>Product name</label><input class="input" name="productName" value="${escapeHtml(product?.productName || '')}" required data-testid="product-name" /></div>
          <div class="field"><label>Price (VND)</label><input class="input" type="number" min="0" step="1" name="price" value="${escapeHtml(product?.price || 0)}" required data-testid="product-price" /></div>
          <div class="field"><label>Stock</label><input class="input" type="number" min="0" step="1" name="stock" value="${escapeHtml(product?.stock ?? 0)}" required data-testid="product-stock" /></div>
        </div>
        <div class="field" style="margin-top:14px"><label>Description</label><textarea class="textarea" name="description" data-testid="product-description">${escapeHtml(product?.description || '')}</textarea></div>
        ${product?.image ? `<div class="field" style="margin-top:14px"><label>Current image</label><div class="selected-image-preview"><img src="${escapeHtml(product.image)}" alt="Current product" /><label><input type="checkbox" name="removeImage" value="true" id="remove-current-image" /> Remove current image</label></div></div>` : ''}
        <div class="field" style="margin-top:14px"><label>${product ? 'Replacement image (optional)' : 'Product image (optional)'}</label><input class="input" type="file" name="imageFile" id="product-image-file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" data-testid="product-image" /></div>
        <div id="product-image-preview" class="selected-image-preview" hidden>
          <img id="product-image-preview-img" alt="Selected product preview" />
          <div id="product-image-file-details"></div>
          <button class="btn btn-danger btn-sm" type="button" id="remove-selected-product-image">Remove selected file</button>
        </div>
        <p class="help">The browser validates MIME type, extension, and the 5 MB limit. The backend repeats validation using the actual file signature.</p>
      </form>`,
    footer: `<button class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" id="save-product" data-testid="save-product">${product ? 'Save changes' : 'Create product'}</button>`
  });

  const fileInput = document.querySelector('#product-image-file');
  const preview = document.querySelector('#product-image-preview');
  const previewImage = document.querySelector('#product-image-preview-img');
  let previewUrl = '';
  const clearSelectedFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    fileInput.value = '';
    preview.hidden = true;
    previewImage.removeAttribute('src');
    document.querySelector('#product-image-file-details').innerHTML = '';
  };
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return clearSelectedFile();
    const validationError = validateImageFile(file, 'Product image');
    if (validationError) {
      clearSelectedFile();
      return toast(validationError, 'error');
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    previewImage.src = previewUrl;
    document.querySelector('#product-image-file-details').innerHTML = fileDetailsMarkup(file);
    preview.hidden = false;
    const removeCurrent = document.querySelector('#remove-current-image');
    if (removeCurrent) removeCurrent.checked = false;
  });
  document.querySelector('#remove-selected-product-image').addEventListener('click', clearSelectedFile);
  document.querySelector('#remove-current-image')?.addEventListener('change', (event) => {
    if (event.currentTarget.checked) clearSelectedFile();
  });

  document.querySelector('#save-product').addEventListener('click', async (event) => {
    const form = document.querySelector('#product-form');
    if (!form.reportValidity()) return;
    const file = fileInput.files?.[0];
    const validationError = validateImageFile(file, 'Product image');
    if (validationError) return toast(validationError, 'error');
    const formData = new FormData(form);
    if (!file) formData.delete('imageFile');
    if (!document.querySelector('#remove-current-image')?.checked) formData.set('removeImage', 'false');
    setBusy(event.currentTarget, true, 'Saving...');
    try {
      await (product ? api.updateProduct(product.productId, formData) : api.createProduct(formData));
      toast(product ? 'Product updated.' : 'Product created.');
      clearSelectedFile();
      closeModal();
      state.productPage.page = 0;
      await renderCurrentView(true);
    } catch (error) {
      if (!error.cancelled) toast(error.message, 'error');
      setBusy(event.currentTarget, false);
    }
  });
}

async function renderCart(container, force = false) {
  if (force || !state.cart) state.cart = await api.cart();
  const items = state.cart?.items || [];
  container.innerHTML = `
    <section class="card">
      <div class="card-header"><div><h3>Cart items</h3><p>Update quantities, remove individual products, or clear the cart after confirmation.</p></div><div class="table-actions"><strong>${money(state.cart?.totalCartPrice)}</strong>${items.length ? '<button class="btn btn-danger btn-sm" id="clear-cart" data-testid="clear-cart">Clear Cart</button>' : ''}</div></div>
      ${items.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Product</th><th>Unit price</th><th>Quantity</th><th>Subtotal</th><th>Actions</th></tr></thead>
          <tbody>${items.map((item) => `
            <tr data-testid="cart-row-${item.cartItemId}">
              <td><div style="display:flex;align-items:center;gap:10px">${item.productImage ? `<img class="product-thumb" src="${escapeHtml(item.productImage)}" alt="" />` : '<div class="product-thumb"></div>'}<strong>${escapeHtml(item.productName)}</strong></div></td>
              <td>${money(item.unitPrice)}</td>
              <td><input class="input" style="width:90px" type="number" min="1" max="${item.productStock || item.quantity}" value="${item.quantity}" id="cart-qty-${item.productId}" data-testid="cart-quantity-${item.productId}" /><div class="help">Stock: ${escapeHtml(item.productStock ?? 'N/A')}</div></td>
              <td>${money(item.itemSubtotal)}</td>
              <td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-update-cart="${item.productId}">Update</button><button class="btn btn-danger btn-sm" data-remove-cart="${item.cartItemId}">Remove</button></div></td>
            </tr>`).join('')}</tbody>
        </table></div>
        <div class="card-pad" style="display:flex;justify-content:flex-end;gap:10px"><button class="btn btn-primary" id="go-checkout">Continue to checkout</button></div>`
        : empty('Your cart is empty', 'Add products from the catalog to begin the checkout workflow.')}
    </section>`;

  container.querySelectorAll('[data-update-cart]').forEach((button) => button.addEventListener('click', async () => {
    const productId = Number(button.dataset.updateCart);
    const input = document.querySelector(`#cart-qty-${productId}`);
    const quantity = Number(input.value);
    const max = Number(input.max || Number.MAX_SAFE_INTEGER);
    if (!Number.isInteger(quantity) || quantity < 1) return toast('Quantity must be at least 1.', 'error');
    if (quantity > max) return toast(`Quantity cannot exceed current stock (${max}).`, 'error');
    setBusy(button, true, 'Updating...');
    try {
      state.cart = await api.updateCartItem(productId, quantity);
      state.checkoutPreview = null;
      state.checkoutPreviewVoucher = null;
      state.checkoutIdempotencyKey = null;
      toast('Cart quantity updated.');
      renderCart(container, false);
    } catch (error) {
      if (!error.cancelled) toast(error.message, 'error');
      setBusy(button, false);
    }
  }));
  container.querySelectorAll('[data-remove-cart]').forEach((button) => button.addEventListener('click', async () => {
    const cartItemId = Number(button.dataset.removeCart);
    const item = items.find((entry) => Number(entry.cartItemId) === cartItemId);
    if (!confirm(`Remove ${item?.productName || 'this product'} from the cart?`)) return;
    setBusy(button, true, 'Removing...');
    try {
      state.cart = await api.removeCartItem(cartItemId);
      state.checkoutPreview = null;
      state.checkoutPreviewVoucher = null;
      state.checkoutIdempotencyKey = null;
      toast('Cart item removed.');
      renderCart(container, false);
    } catch (error) {
      if (!error.cancelled) toast(error.message, 'error');
      setBusy(button, false);
    }
  }));
  document.querySelector('#clear-cart')?.addEventListener('click', async (event) => {
    if (!confirm(`Clear all ${items.length} distinct product(s) from the cart? This action cannot be undone.`)) return;
    setBusy(event.currentTarget, true, 'Clearing...');
    try {
      state.cart = await api.clearCart();
      state.checkoutPreview = null;
      state.checkoutPreviewVoucher = null;
      state.checkoutIdempotencyKey = null;
      toast('Cart cleared.');
      renderCart(container, false);
    } catch (error) {
      if (!error.cancelled) toast(error.message, 'error');
      setBusy(event.currentTarget, false);
    }
  });
  document.querySelector('#go-checkout')?.addEventListener('click', () => {
    state.view = 'checkout';
    renderShell();
  });
}

async function renderAddresses(container, force = false) {
  if (force || !state.addresses.length) state.addresses = await api.addresses();
  container.innerHTML = `
    <div class="toolbar" style="justify-content:flex-end"><button class="btn btn-primary" id="new-address" data-testid="new-address">+ New address</button></div>
    <div class="grid grid-3">
      ${state.addresses.length ? state.addresses.map((address) => addressCard(address)).join('') : `<div class="card" style="grid-column:1/-1">${empty('No addresses', 'Create a valid Vietnamese delivery address before checkout.')}</div>`}
    </div>`;
  document.querySelector('#new-address').addEventListener('click', () => openAddressModal());
  container.querySelectorAll('[data-edit-address]').forEach((button) => button.addEventListener('click', () => {
    openAddressModal(state.addresses.find((a) => a.addressId === Number(button.dataset.editAddress)));
  }));
  container.querySelectorAll('[data-set-default-address]').forEach((button) => button.addEventListener('click', async () => {
    const addressId = Number(button.dataset.setDefaultAddress);
    const address = state.addresses.find((item) => Number(item.addressId) === addressId);
    if (!address) return toast('Address no longer exists. Refresh and try again.', 'error');
    setBusy(button, true, 'Setting default...');
    try {
      await api.updateAddress(addressId, {
        receiverName: address.receiverName,
        receiverPhone: address.receiverPhone,
        province: address.province,
        district: address.district,
        ward: address.ward,
        street: address.street,
        isDefault: true
      });
      state.addresses = await api.addresses();
      toast('Default address updated.');
      renderAddresses(container, false);
    } catch (error) {
      if (!error.cancelled) toast(error.message, 'error', 'Update failed');
      setBusy(button, false);
    }
  }));
  container.querySelectorAll('[data-delete-address]').forEach((button) => button.addEventListener('click', async () => {
    const addressId = Number(button.dataset.deleteAddress);
    const address = state.addresses.find((item) => item.addressId === addressId);
    if (!confirm(`Delete the address for ${address?.receiverName || addressId}? Addresses already used by orders cannot be deleted.`)) return;
    setBusy(button, true, 'Deleting...');
    try {
      const response = await api.deleteAddress(addressId);
      state.addresses = await api.addresses();
      toast(response.message || 'Address deleted.');
      renderAddresses(container, false);
    } catch (error) {
      if (!error.cancelled) toast(error.message, 'error', 'Delete failed');
      setBusy(button, false);
    }
  }));
}

function addressCard(address) {
  return `<article class="card card-pad" data-testid="address-${address.addressId}">
    <div style="display:flex;justify-content:space-between;gap:10px"><strong>${escapeHtml(address.receiverName)}</strong>${address.isDefault ? '<span class="badge badge-green">Default</span>' : ''}</div>
    <p class="help">${escapeHtml(address.receiverPhone)}</p>
    <p style="font-size:13px;line-height:1.6">${escapeHtml(address.street)}, ${escapeHtml(address.ward)}, ${escapeHtml(address.district)}, ${escapeHtml(address.province)}</p>
    <div class="table-actions">
      ${address.isDefault ? '' : `<button class="btn btn-secondary btn-sm" data-set-default-address="${address.addressId}" data-testid="set-default-address-${address.addressId}">Set default</button>`}
      <button class="btn btn-secondary btn-sm" data-edit-address="${address.addressId}" data-testid="edit-address-${address.addressId}">Edit address</button>
      <button class="btn btn-danger btn-sm" data-delete-address="${address.addressId}" data-testid="delete-address-${address.addressId}">Delete address</button>
    </div>
  </article>`;
}

function openAddressModal(address = null) {
  const mustBeDefault = (!address && state.addresses.length === 0) || Boolean(address?.isDefault && state.addresses.length === 1);
  showModal({
    title: address ? 'Edit address' : 'Create address',
    body: `
      <form id="address-form" data-testid="address-form">
        <div class="form-grid">
          <div class="field"><label>Receiver name</label><input class="input" name="receiverName" value="${escapeHtml(address?.receiverName || '')}" required data-testid="receiver-name" /></div>
          <div class="field"><label>Vietnamese phone</label><input class="input" id="receiver-phone" name="receiverPhone" type="tel" inputmode="tel" maxlength="12" value="${escapeHtml(address?.receiverPhone || '')}" pattern="${VIETNAM_PHONE_PATTERN}" required data-testid="receiver-phone" /></div>
          <div class="field"><label>Province / City</label><input class="input" name="province" value="${escapeHtml(address?.province || '')}" required data-testid="province" /></div>
          <div class="field"><label>District</label><input class="input" name="district" value="${escapeHtml(address?.district || '')}" required data-testid="district" /></div>
          <div class="field"><label>Ward</label><input class="input" name="ward" value="${escapeHtml(address?.ward || '')}" required data-testid="ward" /></div>
          <div class="field"><label>Street / House number</label><input class="input" name="street" value="${escapeHtml(address?.street || '')}" required data-testid="street" /></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:15px"><input type="checkbox" name="isDefault" ${(address?.isDefault || mustBeDefault) ? 'checked' : ''} ${mustBeDefault ? 'disabled' : ''} /> Set as default address</label>
        ${mustBeDefault ? '<p class="help">At least one saved address must remain the default address.</p>' : ''}
        <p class="help">Accepted: 0912345678 or +84912345678. Letters and extra digits are blocked.</p>
      </form>`,
    footer: `<button class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" id="save-address" data-testid="save-address">Save address</button>`
  });
  bindPhoneOnlyInput(document.querySelector('#receiver-phone'));
  document.querySelector('#save-address').addEventListener('click', async (event) => {
    const form = document.querySelector('#address-form');
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const phone = sanitizePhoneValue(data.get('receiverPhone'));
    if (!isValidVietnamPhone(phone)) return toast('Phone must be 0xxxxxxxxx or +84xxxxxxxxx.', 'error');
    const payload = {
      receiverName: data.get('receiverName').trim(),
      receiverPhone: phone,
      province: data.get('province').trim(),
      district: data.get('district').trim(),
      ward: data.get('ward').trim(),
      street: data.get('street').trim(),
      isDefault: mustBeDefault || data.get('isDefault') === 'on'
    };
    setBusy(event.currentTarget, true, 'Saving...');
    try {
      await (address ? api.updateAddress(address.addressId, payload) : api.createAddress(payload));
      state.addresses = await api.addresses();
      toast(address ? 'Address updated.' : 'Address created.');
      closeModal();
      renderCurrentView();
    } catch (error) {
      toast(error.message, 'error');
      setBusy(event.currentTarget, false);
    }
  });
}


async function renderProfile(container, force = false) {
  if (force || !state.profile) state.profile = await api.profile();
  const profile = state.profile;
  container.innerHTML = `
    <div class="grid grid-2">
      <section class="card card-pad">
        <h3 style="margin-top:0">Account profile</h3>
        <form id="profile-form" data-testid="profile-form">
          <div class="field"><label>Username</label><input class="input" value="${escapeHtml(profile.username)}" readonly data-testid="profile-username" /><p class="help">Username is read-only so the current JWT remains valid.</p></div>
          <div class="field" style="margin-top:14px"><label>Email</label><input class="input" value="${escapeHtml(profile.email || '')}" readonly data-testid="profile-email" /></div>
          <div class="field" style="margin-top:14px"><label>Full name</label><input class="input" name="fullName" maxlength="100" value="${escapeHtml(profile.fullName || '')}" required data-testid="profile-full-name" /></div>
          <div class="field" style="margin-top:14px"><label>Vietnamese phone</label><input class="input" id="profile-phone" name="phone" type="tel" inputmode="tel" maxlength="12" pattern="${VIETNAM_PHONE_PATTERN}" value="${escapeHtml(profile.phone || '')}" required data-testid="profile-phone" /><p class="help">Accepted: 10-digit local number or +84 format.</p></div>
          <div class="form-actions"><button class="btn btn-primary" type="submit" data-testid="save-profile">Save profile</button></div>
        </form>
      </section>
      <section class="card card-pad">
        <h3 style="margin-top:0">Account information</h3>
        <div class="test-case"><h4>Role</h4><p>${escapeHtml(profile.role)}</p></div>
        <div class="test-case"><h4>User ID</h4><p>${escapeHtml(profile.userId)}</p></div>
        <div class="test-case"><h4>Role validation</h4><p>Only CUSTOMER and ADMIN sessions are accepted. Unknown roles are blocked instead of being shown as Customer.</p></div>
      </section>
    </div>`;
  bindPhoneOnlyInput(document.querySelector('#profile-phone'));
  document.querySelector('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const button = event.submitter;
    const data = new FormData(event.currentTarget);
    const phone = sanitizePhoneValue(data.get('phone'));
    if (!isValidVietnamPhone(phone)) return toast('Phone must be 0xxxxxxxxx or +84xxxxxxxxx.', 'error');
    setBusy(button, true, 'Saving...');
    try {
      state.profile = await api.updateProfile({ fullName: data.get('fullName').trim(), phone });
      state.session = { ...state.session, fullName: state.profile.fullName, phone: state.profile.phone };
      saveSession(state.session);
      toast('Profile updated successfully.');
      renderProfile(container, false);
    } catch (error) {
      toast(error.message, 'error', 'Profile update failed');
      setBusy(button, false);
    }
  });
}

function paymentMethodHelp(methodName) {
  return normalizeName(methodName) === 'QR_CODE'
    ? '<div class="payment-help qr"><strong>QR online payment</strong><p>After the order is created, the backend serves the exact MB Bank QR image configured for this project. Use the displayed order total and transfer note, then upload the receipt.</p></div>'
    : '<div class="payment-help cod"><strong>Cash on delivery (COD)</strong><p>Pay the courier when the order arrives. The order remains PENDING until the delivery workflow is completed.</p></div>';
}

function paymentMethodLabel(methodName) {
  return normalizeName(methodName) === 'QR_CODE'
    ? ['QR_CODE — online payment', 'Scan a QR code and upload the payment receipt.']
    : ['COD — cash on delivery', 'Pay the courier when the order is delivered.'];
}

async function renderCheckout(container, force = false) {
  const [cart, addresses, paymentMethods] = await Promise.all([
    force || !state.cart ? api.cart() : Promise.resolve(state.cart),
    force || !state.addresses.length ? api.addresses() : Promise.resolve(state.addresses),
    force || !state.paymentMethods.length ? api.paymentMethods() : Promise.resolve(state.paymentMethods)
  ]);
  state.cart = cart;
  state.addresses = addresses;
  state.paymentMethods = (Array.isArray(paymentMethods) ? paymentMethods : [])
    .map((method) => ({ ...method, methodName: canonicalPaymentMethodName(method.methodName) }))
    .filter((method) => Number(method.paymentMethodId) > 0 && ['COD', 'QR_CODE'].includes(method.methodName));

  if (!cart.items?.length) {
    container.innerHTML = `<div class="card">${empty('Checkout require at least one cart item', 'Add at least one product to the cart before opening checkout.')}</div>`;
    return;
  }
  if (!state.paymentMethods.length) {
    container.innerHTML = `<div class="card card-pad">${empty('Checkout unavailable', 'The backend did not return a valid COD or QR_CODE payment method.')}</div>`;
    return;
  }

  const initialAddressMode = state.addresses.length ? 'saved' : 'manual';
  const initialPaymentMethod = state.paymentMethods.find((method) => method.methodName === 'COD')
    || state.paymentMethods.find((method) => method.methodName === 'QR_CODE')
    || state.paymentMethods[0];
  if (!state.checkoutIdempotencyKey) state.checkoutIdempotencyKey = createIdempotencyKey();

  container.innerHTML = `
    <div class="grid grid-2">
      <section class="card card-pad">
        <h3 style="margin-top:0">Order details</h3>
        <form id="checkout-form" data-testid="checkout-form">
          <fieldset class="address-mode-group"><legend>Delivery address</legend>
            <div class="address-mode-options" role="radiogroup" aria-label="Delivery address source">
              <label class="address-mode-option ${state.addresses.length ? '' : 'disabled'}"><input type="radio" name="addressMode" value="saved" ${initialAddressMode === 'saved' ? 'checked' : ''} ${state.addresses.length ? '' : 'disabled'} data-testid="address-mode-saved" /><span><strong>Choose a saved address</strong><small>Select one of the addresses from your account.</small></span></label>
              <label class="address-mode-option"><input type="radio" name="addressMode" value="manual" ${initialAddressMode === 'manual' ? 'checked' : ''} data-testid="address-mode-manual" /><span><strong>Enter an address manually</strong><small>The address is saved only as an immutable snapshot inside the order.</small></span></label>
            </div>
          </fieldset>
          <div id="saved-address-panel" class="checkout-address-panel"><div class="field"><label>Saved address</label><select class="select" name="addressId" data-testid="checkout-address"><option value="">Select address</option>${state.addresses.map((a) => `<option value="${a.addressId}" ${a.isDefault ? 'selected' : ''}>${escapeHtml(a.receiverName)} — ${escapeHtml(a.street)}, ${escapeHtml(a.ward)}, ${escapeHtml(a.district)}, ${escapeHtml(a.province)}</option>`).join('')}</select></div></div>
          <div id="manual-address-panel" class="checkout-address-panel" hidden><div class="form-grid">
            <div class="field"><label>Receiver name</label><input class="input" name="manualReceiverName" maxlength="100" autocomplete="name" data-testid="checkout-manual-receiver-name" /></div>
            <div class="field"><label>Vietnamese phone</label><input class="input" id="checkout-manual-phone" name="manualReceiverPhone" type="tel" inputmode="tel" maxlength="12" pattern="${VIETNAM_PHONE_PATTERN}" autocomplete="tel" placeholder="0912345678 or +84912345678" data-testid="checkout-manual-phone" /></div>
            <div class="field"><label>Province / City</label><input class="input" name="manualProvince" maxlength="100" data-testid="checkout-manual-province" /></div>
            <div class="field"><label>District</label><input class="input" name="manualDistrict" maxlength="100" data-testid="checkout-manual-district" /></div>
            <div class="field"><label>Ward</label><input class="input" name="manualWard" maxlength="100" data-testid="checkout-manual-ward" /></div>
            <div class="field"><label>Street / House number</label><input class="input" name="manualStreet" maxlength="255" data-testid="checkout-manual-street" /></div>
          </div><p class="help checkout-address-note">If checkout fails, no standalone Address row is left behind.</p></div>

          <fieldset class="address-mode-group payment-method-group"><legend>Payment method</legend><div class="address-mode-options payment-method-options" role="radiogroup" aria-label="Payment method">${state.paymentMethods.map((method) => { const [label, help] = paymentMethodLabel(method.methodName); return `<label class="address-mode-option"><input type="radio" name="paymentMethodId" value="${method.paymentMethodId}" ${Number(method.paymentMethodId) === Number(initialPaymentMethod.paymentMethodId) ? 'checked' : ''} data-method-name="${escapeHtml(method.methodName)}" data-testid="payment-method-${method.methodName.toLowerCase()}" /><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small></span></label>`; }).join('')}</div></fieldset>
          <div id="payment-method-help">${paymentMethodHelp(initialPaymentMethod.methodName)}</div>
          <div class="field" style="margin-top:14px"><label>Voucher code</label><input class="input" name="voucherCode" id="checkout-voucher" value="${escapeHtml(state.checkoutVoucher)}" placeholder="Optional" autocomplete="off" data-testid="checkout-voucher" /><p class="help">Price preview updates automatically after you stop typing.</p></div>
          <div class="field" style="margin-top:14px"><label>Order note</label><textarea class="textarea" name="note" maxlength="500" data-testid="checkout-note"></textarea></div>
          <button class="btn btn-primary" type="submit" style="width:100%;margin-top:18px" data-testid="place-order" disabled>Place order</button>
        </form>
      </section>
      <section class="card"><div class="card-header"><div><h3>Price preview</h3><p>Automatically recalculated using current product prices and stock</p></div></div><div id="preview-panel">${loading('Calculating the current cart price...')}</div></section>
    </div>`;

  const checkoutForm = document.querySelector('#checkout-form');
  const savedAddressPanel = document.querySelector('#saved-address-panel');
  const manualAddressPanel = document.querySelector('#manual-address-panel');
  const savedAddressSelect = checkoutForm.elements.addressId;
  const voucherInput = document.querySelector('#checkout-voucher');
  const previewPanel = document.querySelector('#preview-panel');
  const placeOrderButton = checkoutForm.querySelector('[data-testid="place-order"]');
  const manualInputs = ['manualReceiverName','manualReceiverPhone','manualProvince','manualDistrict','manualWard','manualStreet'].map((name) => checkoutForm.elements[name]);
  let previewSequence = 0;

  function resetCheckoutIdentity() { state.checkoutIdempotencyKey = createIdempotencyKey(); }
  function setAddressMode(mode) {
    const manual = mode === 'manual';
    savedAddressPanel.hidden = manual;
    manualAddressPanel.hidden = !manual;
    savedAddressSelect.disabled = manual;
    savedAddressSelect.required = !manual;
    manualInputs.forEach((input) => { input.disabled = !manual; input.required = manual; });
    resetCheckoutIdentity();
  }
  async function refreshPreview() {
    const voucher = voucherInput.value.trim();
    const sequence = ++previewSequence;
    state.checkoutVoucher = voucher;
    state.checkoutPreview = null;
    state.checkoutPreviewVoucher = null;
    placeOrderButton.disabled = true;
    previewPanel.innerHTML = loading(voucher ? `Checking voucher ${voucher}...` : 'Calculating current prices...');
    try {
      const preview = await api.previewOrder(voucher);
      if (sequence !== previewSequence || state.view !== 'checkout') return;
      state.checkoutPreview = preview;
      state.checkoutPreviewVoucher = voucher;
      previewPanel.innerHTML = previewMarkup(preview);
      placeOrderButton.disabled = false;
    } catch (error) {
      if (sequence !== previewSequence || error.cancelled || error.authExpired) return;
      previewPanel.innerHTML = `<div class="card-pad">${empty('Price preview unavailable', error.message)}</div>`;
      placeOrderButton.disabled = true;
    }
  }

  setAddressMode(initialAddressMode);
  bindPhoneOnlyInput(document.querySelector('#checkout-manual-phone'));
  checkoutForm.querySelectorAll('input[name="addressMode"]').forEach((radio) => radio.addEventListener('change', (event) => setAddressMode(event.target.value)));
  checkoutForm.querySelectorAll('input[name="paymentMethodId"]').forEach((radio) => radio.addEventListener('change', (event) => { document.querySelector('#payment-method-help').innerHTML = paymentMethodHelp(event.target.dataset.methodName); resetCheckoutIdentity(); }));
  checkoutForm.addEventListener('input', (event) => { if (event.target.id !== 'checkout-voucher') resetCheckoutIdentity(); });
  voucherInput.addEventListener('input', () => {
    clearTimeout(state.checkoutPreviewTimer);
    ++previewSequence;
    state.checkoutVoucher = voucherInput.value.trim();
    state.checkoutPreview = null;
    state.checkoutPreviewVoucher = null;
    resetCheckoutIdentity();
    placeOrderButton.disabled = true;
    previewPanel.innerHTML = loading('Updating voucher price...');
    state.checkoutPreviewTimer = setTimeout(refreshPreview, 300);
  });

  checkoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = new FormData(event.currentTarget);
    const voucher = String(data.get('voucherCode') || '').trim();
    if (!state.checkoutPreview || state.checkoutPreviewVoucher !== voucher) {
      await refreshPreview();
      if (!state.checkoutPreview || state.checkoutPreviewVoucher !== voucher) return toast('Wait for a valid automatic price preview.', 'error', 'Price not ready');
    }
    const paymentMethodId = Number(data.get('paymentMethodId'));
    const paymentMethod = state.paymentMethods.find((method) => Number(method.paymentMethodId) === paymentMethodId);
    if (!paymentMethod) return toast('Choose a valid COD or QR payment method returned by the backend.', 'error');
    const addressMode = String(data.get('addressMode'));
    const payload = { paymentMethodId, voucherCode: voucher || null, note: String(data.get('note') || '').trim(), addressId: null, manualAddress: null };
    if (addressMode === 'manual') {
      const phone = sanitizePhoneValue(data.get('manualReceiverPhone'));
      if (!isValidVietnamPhone(phone)) return toast('Phone must be 0xxxxxxxxx or +84xxxxxxxxx.', 'error');
      payload.manualAddress = {
        receiverName: String(data.get('manualReceiverName') || '').trim(), receiverPhone: phone,
        province: String(data.get('manualProvince') || '').trim(), district: String(data.get('manualDistrict') || '').trim(),
        ward: String(data.get('manualWard') || '').trim(), street: String(data.get('manualStreet') || '').trim()
      };
    } else {
      payload.addressId = Number(data.get('addressId'));
      if (!Number.isInteger(payload.addressId) || payload.addressId <= 0) return toast('Choose a saved delivery address.', 'error');
    }
    const isQr = paymentMethod.methodName === 'QR_CODE';
    if (!confirm(`Place this ${isQr ? 'QR online payment' : 'cash on delivery'} order? Current product prices and stock will be checked again by the backend.`)) return;
    setBusy(event.submitter, true, 'Creating order...');
    try {
      const key = state.checkoutIdempotencyKey || createIdempotencyKey();
      state.checkoutIdempotencyKey = key;
      const order = await api.checkout(payload, key);
      state.cart = null; state.products = []; state.orders = [];
      state.checkoutPreview = null; state.checkoutPreviewVoucher = null; state.checkoutVoucher = '';
      state.checkoutIdempotencyKey = null;
      state.view = 'orders';
      renderShell();
      if (isQr) {
        toast(`Order ${order.orderCode} created. Scan the configured MB Bank QR and upload the receipt.`);
        setTimeout(() => openPaymentQrModal(order.orderId), 0);
      } else setTimeout(() => openCodOrderSuccessModal(order), 0);
    } catch (error) {
      if (!error.cancelled) toast(error.message, 'error', 'Checkout failed');
      setBusy(event.submitter, false);
    }
  });
  await refreshPreview();
}

function previewMarkup(preview) {
  return `<div class="card-pad">
    ${preview.items.map((item) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)"><span>${escapeHtml(item.productName)} × ${item.quantity}</span><strong>${money(item.itemSubtotal)}</strong></div>`).join('')}
    <div style="display:grid;gap:9px;margin-top:16px">
      <div style="display:flex;justify-content:space-between"><span>Subtotal</span><strong>${money(preview.subtotal)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Discount</span><strong>− ${money(preview.discount)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Shipping</span><strong>${money(preview.shippingFee)}</strong></div>
      <div style="display:flex;justify-content:space-between;font-size:18px;padding-top:12px;border-top:1px solid var(--line)"><span>Total</span><strong>${money(preview.total)}</strong></div>
    </div>
  </div>`;
}

function openCodOrderSuccessModal(order) {
  showModal({
    title: 'Order placed successfully',
    body: `<div class="order-success" data-testid="cod-order-success">
      <div class="order-success-icon">✓</div>
      <h3>COD order success</h3>
      <p>Your order <strong>${escapeHtml(order.orderCode)}</strong> was created successfully.</p>
      <div class="order-meta">
        <div><span>Order status</span><strong>${escapeHtml(order.status || 'PENDING')}</strong></div>
        <div><span>Payment</span><strong>Cash on delivery</strong></div>
        <div><span>Total</span><strong>${money(order.total)}</strong></div>
      </div>
      <p class="help">Pay the courier when the order is delivered. Stock and voucher usage were recorded by the backend.</p>
    </div>`,
    footer: '<button class="btn btn-primary" id="view-cod-order" data-testid="view-cod-order">View My Orders</button>'
  });
  document.querySelector('#view-cod-order')?.addEventListener('click', closeModal);
}

function paymentQrDetailsMarkup(info, imageUrl, adminView = false) {
  return `<div class="payment-qr"><img src="${escapeHtml(imageUrl)}" alt="Configured MB Bank payment QR for ${escapeHtml(info.orderCode)}" data-testid="payment-qr-image" /><div>
    ${statusBadge(info.paymentStatus || 'AWAITING_PAYMENT', 'Payment')}
    <h3>${escapeHtml(info.orderCode)}</h3><p class="qr-amount">${money(info.amount)}</p>
    <div class="qr-bank-details"><div><span>Payment recipient</span><strong>Use the bank and account encoded in this exact QR image</strong></div><div><span>Transfer note</span><strong>${escapeHtml(info.transferNote || info.orderCode)}</strong></div></div>
    <p class="help">${adminView ? "This is the project's exact configured MB Bank QR image. Compare the protected receipt with the displayed order amount and transfer note before verification." : 'Scan this exact MB Bank QR image, confirm the displayed order amount and transfer note, then upload your receipt.'}</p>
  </div></div>`;
}

async function openConfiguredPaymentQrModal({ orderId, adminView = false, title = 'Order payment QR' } = {}) {
  showModal({ title, large: true, body: `<div id="payment-qr-content">${loading('Loading configured MB Bank QR...')}</div>`, footer: '<button class="btn btn-secondary" data-close-modal>Close</button>' });
  try {
    const [info, blob] = await Promise.all([
      adminView ? api.adminPaymentQrInfo(orderId) : api.paymentQrInfo(orderId),
      adminView ? api.adminPaymentQrCode(orderId) : api.paymentQrCode(orderId)
    ]);
    const modal = document.querySelector('#active-modal');
    if (!modal) return;
    const objectUrl = URL.createObjectURL(blob);
    modal.dataset.objectUrl = objectUrl;
    document.querySelector('#payment-qr-content').innerHTML = paymentQrDetailsMarkup(info, objectUrl, adminView);
  } catch (error) {
    const content = document.querySelector('#payment-qr-content');
    if (content && !error.cancelled) content.innerHTML = `<div class="empty"><strong>Unable to load payment QR</strong>${escapeHtml(error.message)}</div>`;
  }
}

async function openPaymentQrModal(orderId) {
  showModal({ title: `QR payment for order #${orderId}`, large: true, body: `<div id="payment-qr-content">${loading('Loading configured MB Bank QR...')}</div>`, footer: '<button class="btn btn-secondary" data-close-modal>Close</button><button class="btn btn-primary" id="payment-upload-receipt" data-testid="payment-upload-receipt">Upload payment receipt</button>' });
  document.querySelector('#payment-upload-receipt')?.addEventListener('click', () => { closeModal(); openQrModal(orderId); });
  try {
    const [info, blob] = await Promise.all([api.paymentQrInfo(orderId), api.paymentQrCode(orderId)]);
    const modal = document.querySelector('#active-modal');
    if (!modal) return;
    const objectUrl = URL.createObjectURL(blob);
    modal.dataset.objectUrl = objectUrl;
    document.querySelector('#payment-qr-content').innerHTML = paymentQrDetailsMarkup(info, objectUrl, false);
    if (normalizeName(info.paymentStatus) === 'PAID') document.querySelector('#payment-upload-receipt')?.remove();
  } catch (error) {
    const content = document.querySelector('#payment-qr-content');
    if (content && !error.cancelled) content.innerHTML = `<div class="empty"><strong>Unable to load QR payment</strong>${escapeHtml(error.message)}</div>`;
  }
}

async function renderOrders(container, force = false) {
  if (force || !state.orders.length) {
    const page = await api.ordersPage(state.ordersPage);
    state.orders = page.content || [];
    state.ordersPage = { page: page.page, size: page.size, totalElements: page.totalElements, totalPages: page.totalPages };
  }
  stopPaymentPolling();
  container.innerHTML = `<div class="toolbar" style="justify-content:flex-end"><button class="btn btn-secondary" id="refresh-payment-status" data-testid="refresh-payment-status">↻ Refresh payment status</button></div><div class="grid">${state.orders.length ? state.orders.map(orderCard).join('') : `<div class="card">${empty('No order history', 'Complete checkout to create an order.')}</div>`}</div>${paginationMarkup(state.ordersPage, 'orders')}`;
  bindPagination(container, 'orders', state.ordersPage, async (page) => { state.ordersPage.page = page; state.orders = []; await renderOrders(container, true); });
  document.querySelector('#refresh-payment-status')?.addEventListener('click', async (event) => { setBusy(event.currentTarget, true, 'Refreshing...'); try { state.orders=[]; await renderOrders(container, true); toast('Order and payment statuses refreshed.'); } catch (error) { if (!error.authExpired && !error.cancelled) toast(error.message, 'error'); setBusy(event.currentTarget, false); } });
  container.querySelectorAll('[data-show-payment-qr]').forEach((button) => button.addEventListener('click', () => openPaymentQrModal(Number(button.dataset.showPaymentQr))));
  container.querySelectorAll('[data-upload-qr]').forEach((button) => button.addEventListener('click', () => openQrModal(Number(button.dataset.uploadQr))));
  container.querySelectorAll('[data-view-receipt]').forEach((button) => button.addEventListener('click', () => openReceiptModal(Number(button.dataset.viewReceipt), false)));

  if (state.orders.some((order) => normalizeName(order.paymentStatus) === 'PENDING_VERIFICATION')) {
    let polling = false;
    state.paymentPollFailures = 0;
    state.paymentPollTimer = setInterval(async () => {
      if (polling || state.view !== 'orders') return;
      polling = true;
      try {
        const previousPaid = new Set(state.orders.filter((order) => normalizeName(order.paymentStatus) === 'PAID').map((order) => order.orderId));
        const page = await api.ordersPage(state.ordersPage);
        const fresh = page.content || [];
        const newlyPaid = fresh.find((order) => normalizeName(order.paymentStatus) === 'PAID' && !previousPaid.has(order.orderId));
        state.paymentPollFailures = 0;
        state.orders = fresh;
        if (newlyPaid) toast(`Payment successful for ${newlyPaid.orderCode}.`, 'success', 'Payment successful');
        await renderOrders(container, false);
      } catch (error) {
        if (error.status === 401 || error.authExpired || error.cancelled) stopPaymentPolling();
        else {
          state.paymentPollFailures += 1;
          if (state.paymentPollFailures >= 3) { stopPaymentPolling(); toast('Automatic payment refresh stopped after three connection failures. Use Refresh payment status to retry.', 'error', 'Payment refresh stopped'); }
        }
      } finally { polling = false; }
    }, 5000);
  }
}

function orderCard(order) {
  const method = canonicalPaymentMethodName(order.paymentMethod);
  const paymentStatus = normalizeName(order.paymentStatus);
  const isQr = method === 'QR_CODE';
  const canUpload = isQr && ['AWAITING_PAYMENT', 'FAILED'].includes(paymentStatus);
  const canShowQr = isQr && paymentStatus !== 'PAID';
  let paymentMessage = paymentStatus === 'PAID'
    ? `<div class="payment-result success"><strong>✓ ${isQr ? 'Payment successful' : 'COD payment completed'}</strong><span>${isQr ? 'The online payment has been verified.' : 'The order was delivered and paid successfully.'}</span></div>`
    : isQr && paymentStatus === 'PENDING_VERIFICATION'
      ? '<div class="payment-result pending"><strong>Receipt submitted</strong><span>Waiting for Admin verification. Automatic refresh stops after repeated connection failures.</span></div>'
      : isQr ? '<div class="payment-result info"><strong>QR payment required</strong><span>Open the configured MB Bank QR and upload a receipt.</span></div>'
        : '<div class="payment-result info"><strong>Cash on delivery</strong><span>Pay the courier when the order is delivered.</span></div>';
  const items = Array.isArray(order.items) ? order.items : [];
  return `<article class="card order-card" data-testid="order-${order.orderId}">
    <div class="order-head"><div><h3>${escapeHtml(order.orderCode)}</h3><p>${dateTime(order.createdAt)}</p></div><div class="status-pair">${statusBadge(order.status, 'Order')}${statusBadge(order.paymentStatus, 'Payment')}</div></div>
    <div class="order-items"><h4>Order items</h4>${items.length ? `<div class="table-wrap"><table><thead><tr><th>Product</th><th>Unit price</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody>${items.map((item) => `<tr><td><div class="order-item-name">${item.productImage ? `<img class="product-thumb" src="${escapeHtml(item.productImage)}" alt="" />` : ''}<strong>${escapeHtml(item.productName || `Product #${item.productId}`)}</strong></div></td><td>${money(item.unitPrice)}</td><td>${Number(item.quantity || 0)}</td><td>${money(item.subtotal)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="help">No item details were returned for this legacy order.</p>'}</div>
    <div class="order-meta"><div><span>Total</span><strong>${money(order.total)}</strong></div><div><span>Payment method</span><strong>${escapeHtml(method)}</strong></div><div><span>Voucher</span><strong>${escapeHtml(order.voucherCode || 'None')}</strong></div><div><span>Receiver</span><strong>${escapeHtml(order.receiverName)}</strong></div><div><span>Phone</span><strong>${escapeHtml(order.receiverPhone)}</strong></div><div><span>Receipt uploaded</span><strong>${order.hasReceipt ? dateTime(order.receiptUploadedAt) : 'Not uploaded'}</strong></div><div><span>Payment verified</span><strong>${order.paymentVerifiedAt ? dateTime(order.paymentVerifiedAt) : 'Not verified'}</strong></div></div>
    ${paymentMessage}<p class="help">${escapeHtml(order.shippingAddress)}</p>
    <div class="order-actions">${canShowQr ? `<button class="btn btn-secondary btn-sm" data-show-payment-qr="${order.orderId}" data-testid="show-payment-qr-${order.orderId}">Show payment QR</button>` : ''}${canUpload ? `<button class="btn btn-primary btn-sm" data-upload-qr="${order.orderId}" data-testid="upload-qr-${order.orderId}">Upload payment receipt</button>` : ''}${order.hasReceipt ? `<button class="btn btn-secondary btn-sm" data-view-receipt="${order.orderId}" data-testid="view-receipt-${order.orderId}">View uploaded receipt</button>` : ''}</div>
  </article>`;
}

async function openReceiptModal(orderId, admin = false) {
  showModal({ title: 'Protected payment receipt', large: true, body: `<div id="receipt-content">${loading('Loading protected receipt...')}</div>`, footer: '<button class="btn btn-secondary" data-close-modal>Close</button>' });
  try {
    const blob = await (admin ? api.adminReceipt(orderId) : api.customerReceipt(orderId));
    const modal = document.querySelector('#active-modal');
    if (!modal) return;
    const objectUrl = URL.createObjectURL(blob);
    modal.dataset.objectUrl = objectUrl;
    document.querySelector('#receipt-content').innerHTML = `<div class="receipt-preview"><img src="${objectUrl}" alt="Protected payment receipt" data-testid="receipt-image" /><p class="help">This image was fetched through an authenticated backend endpoint and is not exposed as a permanent public URL.</p></div>`;
  } catch (error) {
    const content = document.querySelector('#receipt-content');
    if (content && !error.cancelled) content.innerHTML = `<div class="empty"><strong>Receipt unavailable</strong>${escapeHtml(error.message)}</div>`;
  }
}

async function openQrModal(orderId) {
  showModal({ title: `Pay and upload receipt for order #${orderId}`, large: true, body: `<div id="qr-upload-content">${loading('Loading order-specific payment QR...')}</div>`, footer: '<button class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" id="upload-qr-submit" data-testid="upload-qr-submit" disabled>Upload receipt</button>' });
  let info;
  try {
    const [loadedInfo, blob] = await Promise.all([api.paymentQrInfo(orderId), api.paymentQrCode(orderId)]);
    info = loadedInfo;
    const modal = document.querySelector('#active-modal');
    if (!modal) return;
    const objectUrl = URL.createObjectURL(blob);
    modal.dataset.objectUrl = objectUrl;
    document.querySelector('#qr-upload-content').innerHTML = `<div class="qr-upload-layout">${paymentQrDetailsMarkup(info, objectUrl, false)}<form id="qr-form"><div class="field"><label>Payment receipt — JPG or PNG, maximum 5 MB</label><input class="input" type="file" id="qr-file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" required data-testid="qr-file" /></div><div id="qr-file-details"></div><p class="help">Uploading again after FAILED safely replaces the old Cloudinary asset.</p></form></div>`;
    const submit = document.querySelector('#upload-qr-submit');
    submit.disabled = false;
    document.querySelector('#qr-file')?.addEventListener('change', (event) => { const file=event.target.files?.[0]; const error=validateImageFile(file,'Receipt'); document.querySelector('#qr-file-details').innerHTML=error?`<p class="field-error">${escapeHtml(error)}</p>`:fileDetailsMarkup(file); if(error) event.target.value=''; });
    submit.addEventListener('click', async (event) => {
      const file = document.querySelector('#qr-file')?.files?.[0];
      const validationError = validateImageFile(file, 'Receipt');
      if (validationError) return toast(validationError, 'error');
      setBusy(event.currentTarget, true, 'Uploading...');
      try { const response = await api.uploadQr(orderId, file); toast(response.message || 'Receipt uploaded.'); closeModal(); state.orders=[]; renderCurrentView(true); }
      catch (error) { if(!error.cancelled) toast(error.message,'error'); setBusy(event.currentTarget,false); }
    });
  } catch (error) {
    const content=document.querySelector('#qr-upload-content'); if(content && !error.cancelled) content.innerHTML=`<div class="empty"><strong>QR unavailable</strong>${escapeHtml(error.message)}</div>`;
  }
}

function ordersTable(orders, admin) {
  if (!orders.length) return empty('No orders found', 'Create customer orders to populate this table.');
  return `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Status</th><th>Payment</th><th>Total</th>${admin ? '<th>Receiver</th>' : ''}</tr></thead><tbody>${orders.map((order) => `<tr><td><strong>${escapeHtml(order.orderCode)}</strong></td><td>${statusBadge(order.status)}</td><td>${statusBadge(order.paymentStatus)}</td><td>${money(order.total)}</td>${admin ? `<td>${escapeHtml(order.receiverName)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

async function renderAdminOrders(container, force = false) {
  if (force || !state.adminOrders.length || !state.orderStatuses.length) {
    const [page, statuses] = await Promise.all([api.adminOrdersPage(state.adminOrdersPage), api.orderStatuses()]);
    state.adminOrders = page.content || [];
    state.adminOrdersPage = { page: page.page, size: page.size, totalElements: page.totalElements, totalPages: page.totalPages };
    state.orderStatuses = Array.isArray(statuses) ? statuses : [];
  }
  if (!state.orderStatuses.length) { container.innerHTML=`<section class="card card-pad">${empty('Order statuses unavailable','The backend did not return valid order statuses.')}</section>`; return; }
  container.innerHTML = `<section class="card"><div class="card-header"><div><h3>All system orders</h3><p>Paginated data, protected receipts, and backend-approved transitions.</p></div></div>${state.adminOrders.length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Order status</th><th>Payment</th><th>Total</th><th>Actions</th></tr></thead><tbody>${state.adminOrders.map((order) => {
    const isQr=canonicalPaymentMethodName(order.paymentMethod)==='QR_CODE'; const currentStatus=normalizeName(order.status); const currentPayment=normalizeName(order.paymentStatus); const allowed=new Set((order.allowedNextStatuses||[]).map(normalizeName)); const statuses=state.orderStatuses.filter((status)=>normalizeName(status.statusName)===currentStatus||allowed.has(normalizeName(status.statusName))); const canChange=statuses.some((status)=>normalizeName(status.statusName)!==currentStatus); const canChoose=isQr&&!['PAID','FAILED'].includes(currentPayment); const canVerify=canChoose&&currentStatus==='PENDING'&&currentPayment==='PENDING_VERIFICATION'&&order.hasReceipt;
    return `<tr data-testid="admin-order-${order.orderId}"><td><strong>${escapeHtml(order.orderCode)}</strong><div class="help">#${order.orderId} · ${dateTime(order.createdAt)}</div><div class="help">Voucher: ${escapeHtml(order.voucherCode||'None')}</div></td><td>${escapeHtml(order.receiverName)}<div class="help">${escapeHtml(order.receiverPhone)}</div></td><td>${statusBadge(order.status,'Current')}<select class="select" style="margin-top:7px;min-width:180px" id="status-${order.orderId}" ${canChange?'':'disabled'}>${statuses.map((status)=>`<option value="${status.statusId}" ${normalizeName(status.statusName)===currentStatus?'selected':''}>${escapeHtml(status.statusName)}</option>`).join('')}</select><div class="help">${canChange?`Allowed next: ${escapeHtml([...allowed].join(', '))}`:'Terminal status'}</div></td><td>${statusBadge(order.paymentStatus,'Current')}<div class="help">${escapeHtml(canonicalPaymentMethodName(order.paymentMethod))}</div>${isQr?`<select class="select" style="margin-top:7px;min-width:180px" id="payment-${order.orderId}" ${canChoose?'':'disabled'}><option value="">Choose verification result</option><option value="PAID">PAID</option><option value="FAILED">FAILED</option></select><div class="help">${order.hasReceipt?`Uploaded: ${dateTime(order.receiptUploadedAt)}${order.paymentVerifiedAt?` · Verified: ${dateTime(order.paymentVerifiedAt)}`:''}`:'Receipt required before verification.'}</div>`:'<div class="help">COD is paid when delivered.</div>'}</td><td>${money(order.total)}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-update-status="${order.orderId}" ${canChange?'':'disabled'}>Update status</button>${isQr?`<button class="btn btn-secondary btn-sm" data-admin-view-payment-qr="${order.orderId}">View Payment QR</button>`:''}${isQr&&order.hasReceipt?`<button class="btn btn-secondary btn-sm" data-admin-view-receipt="${order.orderId}">View Receipt</button>`:''}${isQr?`<button class="btn btn-success btn-sm" data-update-payment="${order.orderId}" ${canVerify?'':'disabled'}>Verify payment</button>`:''}</div></td></tr>`;
  }).join('')}</tbody></table></div>`:empty('No system orders','Create an order using a customer account.')}</section>${paginationMarkup(state.adminOrdersPage,'admin-orders')}`;
  bindPagination(container,'admin-orders',state.adminOrdersPage,async(page)=>{state.adminOrdersPage.page=page;state.adminOrders=[];await renderAdminOrders(container,true);});
  container.querySelectorAll('[data-admin-view-payment-qr]').forEach((button)=>button.addEventListener('click',()=>openConfiguredPaymentQrModal({orderId:Number(button.dataset.adminViewPaymentQr),adminView:true,title:'Order-specific payment QR'})));
  container.querySelectorAll('[data-admin-view-receipt]').forEach((button)=>button.addEventListener('click',()=>openReceiptModal(Number(button.dataset.adminViewReceipt),true)));
  container.querySelectorAll('[data-update-status]').forEach((button)=>button.addEventListener('click',async()=>{const orderId=Number(button.dataset.updateStatus);const order=state.adminOrders.find((x)=>Number(x.orderId)===orderId);const statusId=Number(document.querySelector(`#status-${orderId}`).value);const selected=state.orderStatuses.find((x)=>Number(x.statusId)===statusId);if(!selected||normalizeName(selected.statusName)===normalizeName(order?.status))return toast('Choose an allowed next status.','error');if(!confirm(`Change ${order?.orderCode} to ${selected.statusName}?`))return;setBusy(button,true,'Updating...');try{await api.updateOrderStatus(orderId,statusId);toast(`Order status updated to ${selected.statusName}.`);state.adminOrders=[];renderCurrentView();}catch(error){if(!error.authExpired&&!error.cancelled)toast(error.message,'error');setBusy(button,false);}}));
  container.querySelectorAll('[data-update-payment]').forEach((button)=>button.addEventListener('click',async()=>{const orderId=Number(button.dataset.updatePayment);const order=state.adminOrders.find((x)=>Number(x.orderId)===orderId);if(!order?.hasReceipt)return toast('Reviewable receipt is required.','error');if(normalizeName(order.status)!=='PENDING'||normalizeName(order.paymentStatus)!=='PENDING_VERIFICATION')return toast('Payment can only be verified for a PENDING order with PENDING_VERIFICATION payment.','error');const paymentStatus=document.querySelector(`#payment-${orderId}`).value;if(!['PAID','FAILED'].includes(paymentStatus))return toast('Choose PAID or FAILED.','error');if(!confirm(`Mark payment for ${order.orderCode} as ${paymentStatus}?`))return;setBusy(button,true,'Updating...');try{await api.verifyPayment(orderId,paymentStatus);toast(paymentStatus==='PAID'?'Payment verified successfully.':'Payment marked as failed.');state.adminOrders=[];renderCurrentView();}catch(error){if(!error.authExpired&&!error.cancelled)toast(error.message,'error');setBusy(button,false);}}));
}

function renderTestLab(container) {
  const cases = isAdmin() ? adminTestCases() : customerTestCases();
  container.innerHTML = `<div class="test-grid"><section class="card card-pad"><h3 style="margin-top:0">Executable workflow checks</h3><p class="help">Read-only checks run immediately. Tests marked destructive require confirmation and operate on real database records.</p>${cases.map((test)=>`<div class="test-case"><h4>${escapeHtml(test.id)} — ${escapeHtml(test.title)}</h4><p>${escapeHtml(test.description)}</p>${test.file?`<input class="input" type="file" id="file-${test.id}" accept="image/jpeg,image/png,.jpg,.jpeg,.png" />`:''}<button class="btn btn-secondary btn-sm" data-run-test="${test.id}">Run test</button><div class="test-result" id="result-${test.id}"></div></div>`).join('')}</section><section class="api-console"><div class="api-console-toolbar"><strong>API evidence log ${isApiLogEnabled()?'':'(disabled in production)'}</strong><button class="btn btn-ghost btn-sm" id="clear-log">Clear</button></div><div class="api-log" id="api-log">${apiLogMarkup()}</div></section></div>`;
  document.querySelector('#clear-log')?.addEventListener('click',()=>{state.apiLogs=[];document.querySelector('#api-log').innerHTML=apiLogMarkup();});
  container.querySelectorAll('[data-run-test]').forEach((button)=>button.addEventListener('click',async()=>{const test=cases.find((item)=>item.id===button.dataset.runTest);const result=document.querySelector(`#result-${test.id}`);if(test.destructive&&!confirm(`${test.title} changes real backend data. Continue?`))return;setBusy(button,true,'Running...');try{const file=test.file?document.querySelector(`#file-${test.id}`)?.files?.[0]:null;const message=await test.run(file);result.style.color='var(--green)';result.textContent=`PASS — ${message}`;}catch(error){result.style.color='var(--red)';result.textContent=`FAIL — ${error.message}`;}finally{setBusy(button,false);}}));
}

function customerTestCases() {
  return [
    { id:'TC-PUB-01',title:'Paginated active products',description:'Loads active products and independent category reference data.',run:async()=>{const [p,c]=await Promise.all([api.productsPage({page:0,size:5}),api.categories()]);if(!Array.isArray(p.content)||!Array.isArray(c))throw new Error('Invalid paged/category contract');return `${p.totalElements} product(s), ${c.length} category(s)`;}},
    { id:'TC-CART-CRUD',title:'Add, update, and remove cart item',description:'Uses an ACTIVE product that is not already in the cart, then removes only the temporary test item.',destructive:true,run:async()=>{const [p,before]=await Promise.all([api.productsPage({page:0,size:100}),api.cart()]);const existingIds=new Set((before.items||[]).map((x)=>Number(x.productId)));const product=p.content.find((x)=>Number(x.stock)>=2&&!existingIds.has(Number(x.productId)));if(!product)throw new Error('No unused product with stock >= 2');await api.addCartItem(product.productId,1);await api.updateCartItem(product.productId,2);const cart=await api.cart();const item=cart.items.find((x)=>Number(x.productId)===Number(product.productId));if(!item||Number(item.quantity)!==2)throw new Error('Update did not persist');await api.removeCartItem(item.cartItemId);state.cart=null;return `Add/update/remove passed for ${product.productName}`;}},
    { id:'TC-VOUCHER-01',title:'Voucher price preview',description:'Enter a voucher code when prompted; blank tests checkout preview without a voucher.',run:async()=>{const code=prompt('Voucher code (leave blank for no voucher):','')||'';const preview=await api.previewOrder(code.trim());if(!Array.isArray(preview.items))throw new Error('Preview items missing');return `Total ${money(preview.total)}`;}},
    { id:'TC-CHECKOUT-COD',title:'Create COD checkout',description:'Creates a real COD order from the current cart and first saved address using an idempotency key.',destructive:true,run:async()=>{const [cart,addresses,methods]=await Promise.all([api.cart(),api.addresses(),api.paymentMethods()]);if(!cart.items?.length)throw new Error('Cart is empty');if(!addresses.length)throw new Error('No saved address');const cod=methods.find((x)=>canonicalPaymentMethodName(x.methodName)==='COD');if(!cod)throw new Error('COD missing');const order=await api.checkout({addressId:addresses[0].addressId,manualAddress:null,paymentMethodId:cod.paymentMethodId,voucherCode:null,note:'Automated Test Lab COD checkout'},createIdempotencyKey());state.cart=null;state.orders=[];return `Created ${order.orderCode}`;}},
    { id:'TC-CHECKOUT-QR',title:'Create QR checkout',description:'Creates a real QR order from the current cart and first saved address using the backend payment-method ID and idempotency key.',destructive:true,run:async()=>{const [cart,addresses,methods]=await Promise.all([api.cart(),api.addresses(),api.paymentMethods()]);if(!cart.items?.length)throw new Error('Cart is empty');if(!addresses.length)throw new Error('No saved address');const qr=methods.find((x)=>canonicalPaymentMethodName(x.methodName)==='QR_CODE');if(!qr)throw new Error('QR_CODE missing');const order=await api.checkout({addressId:addresses[0].addressId,manualAddress:null,paymentMethodId:qr.paymentMethodId,voucherCode:null,note:'Automated Test Lab QR checkout'},createIdempotencyKey());state.cart=null;state.orders=[];return `Created QR order ${order.orderCode}`;}},
    { id:'TC-RECEIPT-UPLOAD',title:'Upload QR receipt',description:'Select a JPG/PNG. Uploads it to the first QR order in AWAITING_PAYMENT or FAILED.',destructive:true,file:true,run:async(file)=>{const error=validateImageFile(file,'Receipt');if(error)throw new Error(error);const page=await api.ordersPage({page:0,size:100});const order=page.content.find((x)=>canonicalPaymentMethodName(x.paymentMethod)==='QR_CODE'&&['AWAITING_PAYMENT','FAILED'].includes(normalizeName(x.paymentStatus)));if(!order)throw new Error('No eligible QR order');await api.uploadQr(order.orderId,file);state.orders=[];return `Uploaded receipt for ${order.orderCode}`;}},
    { id:'TC-ORD-01',title:'Paginated order items',description:'Verifies each returned order contains an items array and protected receipt metadata.',run:async()=>{const page=await api.ordersPage({page:0,size:10});const invalid=page.content.find((x)=>!Array.isArray(x.items)||!('hasReceipt' in x));if(invalid)throw new Error('Order contract incomplete');return `${page.totalElements} order(s)`;}},
    { id:'TC-SEC-01',title:'Customer denied admin orders',description:'Admin endpoint must reject a CUSTOMER token.',run:async()=>{try{await api.adminOrdersPage({page:0,size:1});}catch(error){if([401,403].includes(error.status))return `Rejected HTTP ${error.status}`;throw error;}throw new Error('Customer accessed Admin orders');}}
  ];
}

function adminTestCases() {
  return [
    {id:'TC-ADM-PAGE',title:'Paginated Admin orders',description:'Loads one page and verifies page metadata.',run:async()=>{const page=await api.adminOrdersPage({page:0,size:10});if(!Array.isArray(page.content)||typeof page.totalElements!=='number')throw new Error('Invalid page contract');return `${page.totalElements} order(s)`;}},
    {id:'TC-VERIFY-PAYMENT',title:'Verify pending QR payment',description:'Marks the first eligible PENDING_VERIFICATION receipt as PAID.',destructive:true,run:async()=>{const page=await api.adminOrdersPage({page:0,size:100});const order=page.content.find((x)=>normalizeName(x.status)==='PENDING'&&normalizeName(x.paymentStatus)==='PENDING_VERIFICATION'&&x.hasReceipt);if(!order)throw new Error('No eligible payment');await api.verifyPayment(order.orderId,'PAID');state.adminOrders=[];return `Verified ${order.orderCode}`;}},
    {id:'TC-ORDER-STATUS',title:'Apply allowed order transition',description:'Selects a backend-allowed transition that also satisfies QR payment rules, then sends the backend status ID.',destructive:true,run:async()=>{const [page,statuses]=await Promise.all([api.adminOrdersPage({page:0,size:100}),api.orderStatuses()]);let choice=null;for(const order of page.content){const allowed=(order.allowedNextStatuses||[]).map(normalizeName);const method=canonicalPaymentMethodName(order.paymentMethod);const payment=normalizeName(order.paymentStatus);const preferred=allowed.find((next)=>next!=='PROCESSING'||method!=='QR_CODE'||payment==='PAID');if(preferred){choice={order,next:preferred};break;}}if(!choice)throw new Error('No order has a currently valid transition');const status=statuses.find((x)=>normalizeName(x.statusName)===choice.next);if(!status)throw new Error(`Status ID missing for ${choice.next}`);await api.updateOrderStatus(choice.order.orderId,status.statusId);state.adminOrders=[];return `${choice.order.orderCode}: ${choice.order.status} → ${choice.next}`;}},
    {id:'TC-RECEIPT-PROTECTED',title:'Protected receipt access',description:'Loads the first available receipt through the authenticated Admin endpoint.',run:async()=>{const page=await api.adminOrdersPage({page:0,size:100});const order=page.content.find((x)=>x.hasReceipt);if(!order)throw new Error('No receipt available');const blob=await api.adminReceipt(order.orderId);if(!blob.size)throw new Error('Empty receipt');return `${blob.size} bytes for ${order.orderCode}`;}},
    {id:'TC-REF-02',title:'Reference data IDs',description:'Loads categories, payment methods, and order statuses from backend APIs.',run:async()=>{const [c,p,s]=await Promise.all([api.categories(),api.paymentMethods(),api.orderStatuses()]);if(!c.length||!p.length||!s.length)throw new Error('Reference data missing');return `${c.length} categories, ${p.length} methods, ${s.length} statuses`;}},
    {id:'TC-SEC-02',title:'Admin denied customer cart',description:'Customer cart endpoint must reject an ADMIN token.',run:async()=>{try{await api.cart();}catch(error){if([401,403].includes(error.status))return `Rejected HTTP ${error.status}`;throw error;}throw new Error('Admin accessed customer cart');}}
  ];
}

function apiLogMarkup() {
  if (!state.apiLogs.length) return '<div class="empty" style="color:#9fb0c7"><strong style="color:white">No API calls captured</strong>Use the application or run a smoke test.</div>';
  return state.apiLogs.map((log) => `<div class="log-item"><div class="log-head"><span class="log-method">${escapeHtml(log.method)}</span><span class="log-status ${log.ok ? 'ok' : 'fail'}">${log.status || 'NETWORK'}</span><span>${log.durationMs} ms</span><span class="log-path">${escapeHtml(log.path)}</span></div><details><summary>Request / response</summary><pre>${escapeHtml(JSON.stringify({ request: log.requestBody, response: log.response }, null, 2))}</pre></details></div>`).join('');
}

function renderSettings(container) {
  const config = getConfig();
  const endpointLabel = config.apiBaseUrl || 'Same origin (/api through the Vite proxy)';
  container.innerHTML = `<div class="grid grid-2"><section class="card card-pad"><h3 style="margin-top:0">Secure API configuration</h3><div class="test-case"><h4>API base URL</h4><p><code>${escapeHtml(endpointLabel)}</code></p><p>The destination is fixed at build time through <code>VITE_API_BASE_URL</code>. No user role can redirect JWT requests from this page.</p></div><div class="test-case"><h4>API evidence logging</h4><p>${isApiLogEnabled()?'Enabled for this test/development build. Personal data is redacted.':'Disabled in this production build.'}</p></div><p class="help">There is no browser-stored default category ID. Product forms require a category returned by <code>GET /api/reference/categories</code>.</p></section><section class="card card-pad"><h3 style="margin-top:0">Runtime protections</h3><div class="test-case"><h4>Session storage</h4><p>JWT is stored in sessionStorage, validated using its exp claim on startup, and removed with all user state after logout or HTTP 401.</p></div><div class="test-case"><h4>Request lifecycle</h4><p>Every request has a timeout and is cancelled when the user changes screens.</p></div><div class="test-case"><h4>Backend reference data</h4><p>Categories, payment methods, and order statuses are loaded from dedicated APIs. Database IDs are never configured manually here.</p></div></section></div>`;
}

window.addEventListener('swt-auth-expired', () => {
  const hadSession = Boolean(state.session);
  resetAuthenticatedState();
  renderAuth();
  if (hadSession) toast('Your session expired or the token is invalid. Please log in again.', 'error', 'Session expired');
});

window.addEventListener('swt-api-log', (event) => {
  state.apiLogs.unshift(event.detail);
  state.apiLogs = state.apiLogs.slice(0, 100);
  const log = document.querySelector('#api-log');
  if (log) log.innerHTML = apiLogMarkup();
});

renderAuth();
if (state.session) renderShell();
