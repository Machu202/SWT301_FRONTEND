import './styles.css';
import {
  api,
  getSession,
  saveSession,
  clearSession,
  getConfig,
  saveConfig
} from './api.js';

const app = document.querySelector('#app');

const state = {
  session: getSession(),
  view: 'dashboard',
  products: [],
  cart: null,
  addresses: [],
  orders: [],
  adminOrders: [],
  apiLogs: [],
  search: '',
  category: 'ALL',
  authTab: 'login',
  checkoutVoucher: '',
  checkoutPreview: null,
  profile: null,
  loginMode: 'username',
  paymentPollTimer: null
};

const VALID_ROLES = new Set(['ADMIN', 'CUSTOMER']);
const VIETNAM_PHONE_PATTERN = '^(?:0[35789][0-9]{8}|\+84[35789][0-9]{8})$';
const role = () => String(state.session?.role || '').replace(/^ROLE_/i, '').trim().toUpperCase();
const hasValidRole = () => VALID_ROLES.has(role());
const isAdmin = () => role() === 'ADMIN';
const isCustomer = () => role() === 'CUSTOMER';

function sanitizePhoneValue(value) {
  const cleaned = String(value || '').replace(/[^0-9+]/g, '');
  const withSinglePlus = cleaned.startsWith('+')
    ? `+${cleaned.slice(1).replaceAll('+', '')}`
    : cleaned.replaceAll('+', '');
  return withSinglePlus.slice(0, withSinglePlus.startsWith('+') ? 12 : 10);
}

function isValidVietnamPhone(value) {
  return new RegExp(VIETNAM_PHONE_PATTERN).test(String(value || '').trim());
}

function bindPhoneOnlyInput(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = sanitizePhoneValue(input.value);
    if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
  });
}

function stopPaymentPolling() {
  if (state.paymentPollTimer) {
    clearInterval(state.paymentPollTimer);
    state.paymentPollTimer = null;
  }
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

function statusBadge(status) {
  const normalized = String(status || '').toUpperCase();
  let className = 'badge';
  if (['PAID', 'DELIVERED', 'ACTIVE'].includes(normalized)) className += ' badge-green';
  else if (['FAILED', 'CANCELLED', 'INACTIVE'].includes(normalized)) className += ' badge-red';
  else if (['PENDING', 'AWAITING_PAYMENT', 'PENDING_VERIFICATION', 'PROCESSING'].includes(normalized)) className += ' badge-orange';
  else className += ' badge-blue';
  return `<span class="${className}">${escapeHtml(status || 'N/A')}</span>`;
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
  settings: ['Environment Settings', 'Map database IDs and configure the API endpoint']
};

function renderAuth() {
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
        <input class="input" id="login-password" name="password" type="password" required autocomplete="current-password" data-testid="login-password" />
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
      <div class="field" style="margin-top:14px"><label>Password</label><input class="input" name="password" type="password" minlength="6" maxlength="40" required data-testid="register-password" /></div>
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

  document.querySelector('#connection-check')?.addEventListener('click', async (event) => {
    setBusy(event.currentTarget, true, 'Checking...');
    try {
      const products = await api.products();
      toast(`Backend is reachable. ${products.length} product(s) returned.`);
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
    state.session = null;
    stopPaymentPolling();
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
      state.view = button.dataset.view;
      renderShell();
    });
  });
  document.querySelector('#logout-button').addEventListener('click', () => {
    stopPaymentPolling();
    clearSession();
    state.session = null;
    state.cart = null;
    state.orders = [];
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
    container.innerHTML = `<div class="card card-pad">${empty('Unable to load this screen', error.message)}</div>`;
    if (error.status === 401) toast('Session expired or token is invalid. Log in again.', 'error');
  }
}

async function renderDashboard(container) {
  if (isAdmin()) {
    const [productsResult, ordersResult] = await Promise.allSettled([api.products(), api.adminOrders()]);
    state.products = productsResult.status === 'fulfilled' ? productsResult.value : [];
    state.adminOrders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
    const revenue = state.adminOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pendingPayments = state.adminOrders.filter((order) => order.paymentStatus === 'PENDING_VERIFICATION').length;
    container.innerHTML = `
      <section class="hero">
        <div><span class="badge">ADMIN TEST WORKSPACE</span><h2>System control and verification</h2><p>Manage products, inspect all orders, approve QR payments, and capture API evidence from a single deterministic interface.</p></div>
        <button class="btn btn-primary" data-go="admin-orders">Review orders</button>
      </section>
      <div class="grid grid-4">
        ${metric('□', 'Products', state.products.length)}
        ${metric('≡', 'Total orders', state.adminOrders.length)}
        ${metric('₫', 'Order value', money(revenue))}
        ${metric('!', 'Payments to verify', pendingPayments)}
      </div>
      <div class="grid grid-2" style="margin-top:18px">
        <section class="card"><div class="card-header"><div><h3>Recent orders</h3><p>Most recent backend records</p></div></div>${ordersTable(state.adminOrders.slice(0, 5), true)}</section>
        <section class="card card-pad"><h3 style="margin-top:0">Testing readiness</h3>${readinessList()}</section>
      </div>`;
  } else {
    const [productsResult, cartResult, ordersResult, addressesResult] = await Promise.allSettled([
      api.products(), api.cart(), api.orders(), api.addresses()
    ]);
    state.products = productsResult.status === 'fulfilled' ? productsResult.value : [];
    state.cart = cartResult.status === 'fulfilled' ? cartResult.value : { items: [], totalCartPrice: 0 };
    state.orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
    state.addresses = addressesResult.status === 'fulfilled' ? addressesResult.value : [];
    container.innerHTML = `
      <section class="hero">
        <div><span class="badge">CUSTOMER TEST WORKSPACE</span><h2>Test the full purchase journey</h2><p>Browse real products, validate cart boundaries, manage Vietnamese delivery details, apply vouchers, create orders, and upload QR payment evidence.</p></div>
        <button class="btn btn-primary" data-go="products">Browse products</button>
      </section>
      <div class="grid grid-4">
        ${metric('□', 'Products', state.products.length)}
        ${metric('🛒', 'Cart items', state.cart?.items?.length || 0)}
        ${metric('⌂', 'Addresses', state.addresses.length)}
        ${metric('≡', 'Orders', state.orders.length)}
      </div>
      <div class="grid grid-2" style="margin-top:18px">
        <section class="card"><div class="card-header"><div><h3>Recent orders</h3><p>Your latest backend orders</p></div></div>${ordersTable(state.orders.slice(0, 5), false)}</section>
        <section class="card card-pad"><h3 style="margin-top:0">Current cart</h3><p class="help">${state.cart?.items?.length || 0} distinct item(s) · ${money(state.cart?.totalCartPrice)}</p><button class="btn btn-secondary" data-go="cart">Open cart</button></section>
      </div>`;
  }
  container.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => {
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
    ['Product endpoint', Array.isArray(state.products)],
    ['Admin order endpoint', Array.isArray(state.adminOrders)],
    ['API evidence capture', true]
  ];
  return checks.map(([label, pass]) => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)"><span>${label}</span>${statusBadge(pass ? 'READY' : 'FAILED')}</div>`).join('');
}

async function loadProducts(force = false) {
  if (force || !state.products.length) state.products = await api.products();
  return state.products;
}

async function renderProducts(container, adminMode = false, force = false) {
  await loadProducts(force);
  if (!adminMode && (force || !state.cart)) state.cart = await api.cart();
  const categories = [...new Set(state.products.map((product) => product.categoryName).filter(Boolean))];
  const filtered = state.products.filter((product) => {
    const matchesSearch = `${product.productName} ${product.description || ''}`.toLowerCase().includes(state.search.toLowerCase());
    const matchesCategory = state.category === 'ALL' || product.categoryName === state.category;
    return matchesSearch && matchesCategory;
  });

  container.innerHTML = `
    <div class="toolbar">
      <div class="field"><input class="input" id="product-search" placeholder="Search name or description" value="${escapeHtml(state.search)}" data-testid="product-search" /></div>
      <select class="select" id="category-filter" style="max-width:220px" data-testid="category-filter">
        <option value="ALL">All categories</option>
        ${categories.map((category) => `<option ${state.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
      </select>
      ${adminMode ? '<button class="btn btn-primary" id="create-product" data-testid="create-product">+ New product</button>' : ''}
    </div>
    ${filtered.length ? `<div class="products">${filtered.map((product) => {
      const inCart = state.cart?.items?.find((item) => item.productId === product.productId)?.quantity || 0;
      const available = Math.max(0, Number(product.stock || 0) - inCart);
      return productCard(product, adminMode, available, inCart);
    }).join('')}</div>` : `<div class="card">${empty('No products found', 'Adjust the search/filter or add products through the admin account.')}</div>`}`;

  document.querySelector('#product-search').addEventListener('input', (event) => {
    state.search = event.target.value;
    const cursor = event.target.selectionStart;
    renderProducts(container, adminMode, false).then(() => {
      const nextInput = document.querySelector('#product-search');
      nextInput?.focus();
      nextInput?.setSelectionRange(cursor, cursor);
    });
  });
  document.querySelector('#category-filter').addEventListener('change', (event) => {
    state.category = event.target.value;
    renderProducts(container, adminMode, false);
  });

  if (adminMode) bindAdminProductActions(container);
  else bindCustomerProductActions(container);
}

function productCard(product, adminMode, available = Number(product.stock || 0), inCart = 0) {
  const image = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.productName)}" onerror="this.parentElement.innerHTML='No image'" />`
    : 'No image';
  return `
    <article class="card product-card" data-testid="product-card-${product.productId}">
      <div class="product-image">${image}</div>
      <div class="product-body">
        <div><span class="badge badge-blue">${escapeHtml(product.categoryName || `Category ${product.categoryId}`)}</span></div>
        <h3>${escapeHtml(product.productName)}</h3>
        <p>${escapeHtml(product.description || 'No description')}</p>
        <div class="product-meta"><span class="price">${money(product.price)}</span><span class="stock">${adminMode ? `Stock: ${escapeHtml(product.stock)}` : `Available: ${escapeHtml(available)}${inCart ? ` · In cart: ${escapeHtml(inCart)}` : ''}`}</span></div>
        ${adminMode ? `
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" data-edit-product="${product.productId}" data-testid="edit-product-${product.productId}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-product="${product.productId}" data-testid="delete-product-${product.productId}">Delete</button>
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
  document.querySelector('#create-product').addEventListener('click', () => openProductModal());
  container.querySelectorAll('[data-edit-product]').forEach((button) => {
    button.addEventListener('click', () => openProductModal(state.products.find((p) => p.productId === Number(button.dataset.editProduct))));
  });
  container.querySelectorAll('[data-delete-product]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = Number(button.dataset.deleteProduct);
      const product = state.products.find((p) => p.productId === id);
      if (!confirm(`Delete "${product?.productName || id}"? This calls the real DELETE endpoint.`)) return;
      setBusy(button, true, 'Deleting...');
      try {
        const response = await api.deleteProduct(id);
        toast(response.message || 'Product deleted.');
        state.products = state.products.filter((p) => p.productId !== id);
        renderProducts(container, true, false);
      } catch (error) {
        toast(error.message, 'error');
        setBusy(button, false);
      }
    });
  });
}

function openProductModal(product = null) {
  const config = getConfig();
  showModal({
    title: product ? 'Edit product' : 'Create product',
    body: `
      <form id="product-form" data-testid="product-form">
        <div class="form-grid">
          <div class="field"><label>Category ID</label><input class="input" type="number" min="1" name="categoryId" value="${escapeHtml(product?.categoryId || config.categoryId)}" required data-testid="product-category-id" /></div>
          <div class="field"><label>Product name</label><input class="input" name="productName" value="${escapeHtml(product?.productName || '')}" required data-testid="product-name" /></div>
          <div class="field"><label>Price (VND)</label><input class="input" type="number" min="0" step="1" name="price" value="${escapeHtml(product?.price || 0)}" required data-testid="product-price" /></div>
          <div class="field"><label>Stock</label><input class="input" type="number" min="0" step="1" name="stock" value="${escapeHtml(product?.stock ?? 0)}" required data-testid="product-stock" /></div>
        </div>
        <div class="field" style="margin-top:14px"><label>Description</label><textarea class="textarea" name="description" data-testid="product-description">${escapeHtml(product?.description || '')}</textarea></div>
        <div class="field" style="margin-top:14px"><label>Image file (optional for update)</label><input class="input" type="file" name="imageFile" accept="image/png,image/jpeg" data-testid="product-image" /></div>
        <p class="help">The backend sends this form as multipart/form-data and uploads images through Cloudinary.</p>
      </form>`,
    footer: `<button class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" id="save-product" data-testid="save-product">${product ? 'Save changes' : 'Create product'}</button>`
  });
  document.querySelector('#save-product').addEventListener('click', async (event) => {
    const form = document.querySelector('#product-form');
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const file = formData.get('imageFile');
    if (file && !file.size) formData.delete('imageFile');
    setBusy(event.currentTarget, true, 'Saving...');
    try {
      const saved = product ? await api.updateProduct(product.productId, formData) : await api.createProduct(formData);
      toast(product ? 'Product updated.' : 'Product created.');
      closeModal();
      const index = state.products.findIndex((p) => p.productId === saved.productId);
      if (index >= 0) state.products[index] = saved;
      else state.products.unshift(saved);
      renderCurrentView();
    } catch (error) {
      toast(error.message, 'error');
      setBusy(event.currentTarget, false);
    }
  });
}

async function renderCart(container, force = false) {
  if (force || !state.cart) state.cart = await api.cart();
  const items = state.cart?.items || [];
  container.innerHTML = `
    <section class="card">
      <div class="card-header"><div><h3>Cart items</h3><p>POST adds, PUT replaces quantity, DELETE removes by cartItemId</p></div><strong>${money(state.cart?.totalCartPrice)}</strong></div>
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
      toast('Cart quantity updated.');
      renderCart(container, false);
    } catch (error) {
      toast(error.message, 'error');
      setBusy(button, false);
    }
  }));
  container.querySelectorAll('[data-remove-cart]').forEach((button) => button.addEventListener('click', async () => {
    setBusy(button, true, 'Removing...');
    try {
      state.cart = await api.removeCartItem(Number(button.dataset.removeCart));
      toast('Cart item removed.');
      renderCart(container, false);
    } catch (error) {
      toast(error.message, 'error');
      setBusy(button, false);
    }
  }));
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
      toast(error.message, 'error', 'Delete failed');
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
      <button class="btn btn-secondary btn-sm" data-edit-address="${address.addressId}" data-testid="edit-address-${address.addressId}">Edit address</button>
      <button class="btn btn-danger btn-sm" data-delete-address="${address.addressId}" data-testid="delete-address-${address.addressId}">Delete address</button>
    </div>
  </article>`;
}

function openAddressModal(address = null) {
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
        <label style="display:flex;align-items:center;gap:8px;margin-top:15px"><input type="checkbox" name="isDefault" ${address?.isDefault ? 'checked' : ''} /> Set as default address</label>
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
      isDefault: data.get('isDefault') === 'on'
    };
    setBusy(event.currentTarget, true, 'Saving...');
    try {
      const saved = address ? await api.updateAddress(address.addressId, payload) : await api.createAddress(payload);
      const safeAddress = {
        addressId: saved.addressId,
        receiverName: saved.receiverName,
        receiverPhone: saved.receiverPhone,
        province: saved.province,
        district: saved.district,
        ward: saved.ward,
        street: saved.street,
        isDefault: saved.isDefault
      };
      if (safeAddress.isDefault) state.addresses.forEach((item) => { item.isDefault = false; });
      const index = state.addresses.findIndex((item) => item.addressId === safeAddress.addressId);
      if (index >= 0) state.addresses[index] = safeAddress;
      else state.addresses.push(safeAddress);
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

function paymentMethodHelp(paymentMethodId, config) {
  const isQr = Number(paymentMethodId) === Number(config.paymentMethodQrId);
  return isQr
    ? '<div class="payment-help qr"><strong>QR online payment</strong><p>The order is created as PENDING with payment status AWAITING_PAYMENT. A QR code is generated immediately. After the receipt is uploaded and Admin verifies it, this page displays “Payment successful”.</p></div>'
    : '<div class="payment-help cod"><strong>Cash on delivery (COD)</strong><p>Pay the courier when the order arrives. The order and payment remain PENDING until the delivery workflow is completed.</p></div>';
}

async function renderCheckout(container, force = false) {
  const [cart, addresses] = await Promise.all([
    force || !state.cart ? api.cart() : Promise.resolve(state.cart),
    force || !state.addresses.length ? api.addresses() : Promise.resolve(state.addresses)
  ]);
  state.cart = cart;
  state.addresses = addresses;
  const config = getConfig();
  const initialAddressMode = state.addresses.length ? 'saved' : 'manual';

  if (!cart.items?.length) {
    container.innerHTML = `<div class="card">${empty('Checkout unavailable', 'The backend requires at least one cart item.')}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="grid grid-2">
      <section class="card card-pad">
        <h3 style="margin-top:0">Order details</h3>
        <form id="checkout-form" data-testid="checkout-form">
          <fieldset class="address-mode-group">
            <legend>Delivery address</legend>
            <div class="address-mode-options" role="radiogroup" aria-label="Delivery address source">
              <label class="address-mode-option ${state.addresses.length ? '' : 'disabled'}">
                <input type="radio" name="addressMode" value="saved" ${initialAddressMode === 'saved' ? 'checked' : ''} ${state.addresses.length ? '' : 'disabled'} data-testid="address-mode-saved" />
                <span><strong>Choose a saved address</strong><small>Select one of the addresses from your account.</small></span>
              </label>
              <label class="address-mode-option">
                <input type="radio" name="addressMode" value="manual" ${initialAddressMode === 'manual' ? 'checked' : ''} data-testid="address-mode-manual" />
                <span><strong>Enter an address manually</strong><small>Type the delivery details directly during checkout.</small></span>
              </label>
            </div>
          </fieldset>

          <div id="saved-address-panel" class="checkout-address-panel">
            <div class="field">
              <label>Saved address</label>
              <select class="select" name="addressId" data-testid="checkout-address">
                <option value="">Select address</option>
                ${state.addresses.map((a) => `<option value="${a.addressId}" ${a.isDefault ? 'selected' : ''}>${escapeHtml(a.receiverName)} — ${escapeHtml(a.street)}, ${escapeHtml(a.ward)}, ${escapeHtml(a.district)}, ${escapeHtml(a.province)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div id="manual-address-panel" class="checkout-address-panel" hidden>
            <div class="form-grid">
              <div class="field"><label>Receiver name</label><input class="input" name="manualReceiverName" maxlength="100" autocomplete="name" data-testid="checkout-manual-receiver-name" /></div>
              <div class="field"><label>Vietnamese phone</label><input class="input" id="checkout-manual-phone" name="manualReceiverPhone" type="tel" inputmode="tel" maxlength="12" pattern="${VIETNAM_PHONE_PATTERN}" autocomplete="tel" placeholder="0912345678 or +84912345678" data-testid="checkout-manual-phone" /></div>
              <div class="field"><label>Province / City</label><input class="input" name="manualProvince" maxlength="100" autocomplete="address-level1" data-testid="checkout-manual-province" /></div>
              <div class="field"><label>District</label><input class="input" name="manualDistrict" maxlength="100" autocomplete="address-level2" data-testid="checkout-manual-district" /></div>
              <div class="field"><label>Ward</label><input class="input" name="manualWard" maxlength="100" autocomplete="address-level3" data-testid="checkout-manual-ward" /></div>
              <div class="field"><label>Street / House number</label><input class="input" name="manualStreet" maxlength="255" autocomplete="street-address" data-testid="checkout-manual-street" /></div>
            </div>
            <p class="help checkout-address-note">The backend stores this address so it can remain attached to the order history.</p>
          </div>

          <div class="field" style="margin-top:14px"><label>Payment method</label><select class="select" id="payment-method" name="paymentMethodId" required data-testid="payment-method"><option value="${config.paymentMethodCodId}">COD — pay when receiving the order</option><option value="${config.paymentMethodQrId}">QR_CODE — online payment</option></select></div>
          <div id="payment-method-help">${paymentMethodHelp(config.paymentMethodCodId, config)}</div>
          <div class="field" style="margin-top:14px"><label>Voucher code</label><div style="display:flex;gap:8px"><input class="input" name="voucherCode" id="checkout-voucher" value="${escapeHtml(state.checkoutVoucher)}" placeholder="Optional" data-testid="checkout-voucher" /><button type="button" class="btn btn-secondary" id="preview-order" data-testid="preview-order">Preview</button></div></div>
          <div class="field" style="margin-top:14px"><label>Order note</label><textarea class="textarea" name="note" maxlength="500" data-testid="checkout-note"></textarea></div>
          <button class="btn btn-primary" type="submit" style="width:100%;margin-top:18px" data-testid="place-order">Place order</button>
        </form>
      </section>
      <section class="card">
        <div class="card-header"><div><h3>Price preview</h3><p>Calculated by the backend, not the browser</p></div></div>
        <div id="preview-panel">${state.checkoutPreview ? previewMarkup(state.checkoutPreview) : '<div class="card-pad"><p class="help">Click Preview to execute GET /api/orders/preview.</p></div>'}</div>
      </section>
    </div>`;

  const checkoutForm = document.querySelector('#checkout-form');
  const savedAddressPanel = document.querySelector('#saved-address-panel');
  const manualAddressPanel = document.querySelector('#manual-address-panel');
  const savedAddressSelect = checkoutForm.elements.addressId;
  const manualAddressInputs = [
    checkoutForm.elements.manualReceiverName,
    checkoutForm.elements.manualReceiverPhone,
    checkoutForm.elements.manualProvince,
    checkoutForm.elements.manualDistrict,
    checkoutForm.elements.manualWard,
    checkoutForm.elements.manualStreet
  ];

  function setCheckoutAddressMode(mode) {
    const useManual = mode === 'manual';
    savedAddressPanel.hidden = useManual;
    manualAddressPanel.hidden = !useManual;
    savedAddressSelect.disabled = useManual;
    savedAddressSelect.required = !useManual;
    manualAddressInputs.forEach((input) => {
      input.disabled = !useManual;
      input.required = useManual;
    });
  }

  setCheckoutAddressMode(initialAddressMode);
  bindPhoneOnlyInput(document.querySelector('#checkout-manual-phone'));

  checkoutForm.querySelectorAll('input[name="addressMode"]').forEach((radio) => {
    radio.addEventListener('change', (event) => setCheckoutAddressMode(event.target.value));
  });

  document.querySelector('#payment-method').addEventListener('change', (event) => {
    document.querySelector('#payment-method-help').innerHTML = paymentMethodHelp(event.target.value, config);
  });

  document.querySelector('#preview-order').addEventListener('click', async (event) => {
    state.checkoutVoucher = document.querySelector('#checkout-voucher').value.trim();
    setBusy(event.currentTarget, true, 'Loading...');
    try {
      state.checkoutPreview = await api.previewOrder(state.checkoutVoucher);
      document.querySelector('#preview-panel').innerHTML = previewMarkup(state.checkoutPreview);
      toast('Order preview calculated by backend.');
    } catch (error) {
      toast(error.message, 'error', 'Preview failed');
    } finally {
      setBusy(event.currentTarget, false);
    }
  });

  checkoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = new FormData(event.currentTarget);
    const addressMode = data.get('addressMode');
    const paymentMethodId = Number(data.get('paymentMethodId'));
    const isQr = paymentMethodId === Number(config.paymentMethodQrId);
    const methodLabel = isQr ? 'QR online payment' : 'cash on delivery';
    const addressLabel = addressMode === 'manual' ? 'the manually entered address' : 'the selected saved address';
    if (!confirm(`Create this order using ${addressLabel} and ${methodLabel}? Stock will be deducted by the backend and the cart will be cleared.`)) return;

    setBusy(event.submitter, true, addressMode === 'manual' ? 'Saving address...' : 'Creating order...');
    try {
      let addressId;
      if (addressMode === 'manual') {
        const receiverPhone = sanitizePhoneValue(data.get('manualReceiverPhone'));
        if (!isValidVietnamPhone(receiverPhone)) {
          throw new Error('Phone must be 0xxxxxxxxx or +84xxxxxxxxx.');
        }
        const createdAddress = await api.createAddress({
          receiverName: String(data.get('manualReceiverName') || '').trim(),
          receiverPhone,
          province: String(data.get('manualProvince') || '').trim(),
          district: String(data.get('manualDistrict') || '').trim(),
          ward: String(data.get('manualWard') || '').trim(),
          street: String(data.get('manualStreet') || '').trim(),
          isDefault: false
        });
        addressId = Number(createdAddress.addressId);
        if (!Number.isInteger(addressId) || addressId <= 0) {
          throw new Error('The backend did not return a valid address ID.');
        }
        state.addresses.push(createdAddress);
        setBusy(event.submitter, true, 'Creating order...');
      } else {
        addressId = Number(data.get('addressId'));
      }

      const payload = {
        addressId,
        paymentMethodId,
        voucherCode: String(data.get('voucherCode') || '').trim() || null,
        note: String(data.get('note') || '').trim()
      };
      const order = await api.checkout(payload);
      state.cart = null;
      state.products = [];
      state.orders = [];
      state.checkoutPreview = null;
      state.checkoutVoucher = '';
      state.view = 'orders';
      if (isQr) {
        toast(`Order ${order.orderCode} created. Scan the QR and upload the receipt.`);
        renderShell();
        setTimeout(() => openPaymentQrModal(order.orderId), 0);
      } else {
        toast(`Order ${order.orderCode} is PENDING. Pay when the courier delivers it.`);
        renderShell();
      }
    } catch (error) {
      toast(error.message, 'error', 'Checkout failed');
      setBusy(event.submitter, false);
    }
  });
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

function openPaymentQrModal(orderId) {
  showModal({
    title: `QR payment for order #${orderId}`,
    body: `<div id="payment-qr-content">${loading('Generating QR code...')}</div>`,
    footer: '<button class="btn btn-secondary" data-close-modal>Close</button><button class="btn btn-primary" id="payment-upload-receipt" data-testid="payment-upload-receipt">Upload payment receipt</button>'
  });
  document.querySelector('#payment-upload-receipt').addEventListener('click', () => {
    closeModal();
    openQrModal(orderId);
  });

  Promise.all([api.paymentQrInfo(orderId), api.paymentQrCode(orderId)])
    .then(([info, blob]) => {
      const modal = document.querySelector('#active-modal');
      if (!modal) return;
      const objectUrl = URL.createObjectURL(blob);
      modal.dataset.objectUrl = objectUrl;
      document.querySelector('#payment-qr-content').innerHTML = `
        <div class="payment-qr">
          <img src="${objectUrl}" alt="Payment QR for ${escapeHtml(info.orderCode)}" data-testid="payment-qr-image" />
          <div>
            <span class="badge badge-blue">${escapeHtml(info.paymentStatus)}</span>
            <h3>${escapeHtml(info.orderCode)}</h3>
            <p class="qr-amount">${money(info.amount)}</p>
            <p class="help">This testing QR contains the order code and amount. After paying, upload a receipt. Admin confirmation changes the payment status to PAID.</p>
            <code class="qr-content">${escapeHtml(info.qrContent)}</code>
          </div>
        </div>`;
      if (String(info.paymentStatus).toUpperCase() === 'PAID') {
        document.querySelector('#payment-upload-receipt')?.remove();
      }
    })
    .catch((error) => {
      const content = document.querySelector('#payment-qr-content');
      if (content) content.innerHTML = `<div class="empty"><strong>Unable to generate QR</strong>${escapeHtml(error.message)}</div>`;
    });
}

async function renderOrders(container, force = false) {
  if (force || !state.orders.length) state.orders = await api.orders();
  stopPaymentPolling();
  container.innerHTML = `
    <div class="toolbar" style="justify-content:flex-end"><button class="btn btn-secondary" id="refresh-payment-status" data-testid="refresh-payment-status">↻ Refresh payment status</button></div>
    <div class="grid">${state.orders.length ? state.orders.map(orderCard).join('') : `<div class="card">${empty('No order history', 'Complete checkout to create an order.')}</div>`}</div>`;
  document.querySelector('#refresh-payment-status').addEventListener('click', async (event) => {
    setBusy(event.currentTarget, true, 'Refreshing...');
    try {
      state.orders = await api.orders();
      await renderOrders(container, false);
      toast('Order and payment statuses refreshed.');
    } catch (error) {
      toast(error.message, 'error');
      setBusy(event.currentTarget, false);
    }
  });
  container.querySelectorAll('[data-show-payment-qr]').forEach((button) => button.addEventListener('click', () => openPaymentQrModal(Number(button.dataset.showPaymentQr))));
  container.querySelectorAll('[data-upload-qr]').forEach((button) => button.addEventListener('click', () => openQrModal(Number(button.dataset.uploadQr))));

  if (state.orders.some((order) => String(order.paymentStatus).toUpperCase() === 'PENDING_VERIFICATION')) {
    let polling = false;
    state.paymentPollTimer = setInterval(async () => {
      if (polling || state.view !== 'orders') return;
      polling = true;
      try {
        const previousPaid = new Set(state.orders.filter((order) => String(order.paymentStatus).toUpperCase() === 'PAID').map((order) => order.orderId));
        const freshOrders = await api.orders();
        const newlyPaid = freshOrders.find((order) => String(order.paymentStatus).toUpperCase() === 'PAID' && !previousPaid.has(order.orderId));
        state.orders = freshOrders;
        if (newlyPaid) toast(`Payment successful for ${newlyPaid.orderCode}.`, 'success', 'Payment successful');
        await renderOrders(container, false);
      } catch {
        // A temporary polling failure should not replace the current screen.
      } finally {
        polling = false;
      }
    }, 5000);
  }
}

function orderCard(order) {
  const method = String(order.paymentMethod || '').toUpperCase();
  const paymentStatus = String(order.paymentStatus || '').toUpperCase();
  const isQr = method === 'QR_CODE';
  const canUpload = isQr && ['AWAITING_PAYMENT', 'FAILED'].includes(paymentStatus);
  const canShowQr = isQr && paymentStatus !== 'PAID';
  let paymentMessage = '';
  if (paymentStatus === 'PAID') {
    paymentMessage = '<div class="payment-result success"><strong>✓ Payment successful</strong><span>The online payment has been verified.</span></div>';
  } else if (isQr && paymentStatus === 'PENDING_VERIFICATION') {
    paymentMessage = '<div class="payment-result pending"><strong>Receipt submitted</strong><span>Waiting for Admin verification. This page checks automatically every 5 seconds.</span></div>';
  } else if (isQr) {
    paymentMessage = '<div class="payment-result info"><strong>QR payment required</strong><span>Scan the QR and upload a receipt to continue.</span></div>';
  } else {
    paymentMessage = '<div class="payment-result info"><strong>Cash on delivery</strong><span>Pay when receiving the order. The order remains PENDING.</span></div>';
  }
  return `<article class="card order-card" data-testid="order-${order.orderId}">
    <div class="order-head"><div><h3>${escapeHtml(order.orderCode)}</h3><p>${dateTime(order.createdAt)}</p></div><div style="display:flex;gap:7px;flex-wrap:wrap">${statusBadge(order.status)}${statusBadge(order.paymentStatus)}</div></div>
    <div class="order-meta">
      <div><span>Total</span><strong>${money(order.total)}</strong></div>
      <div><span>Payment</span><strong>${escapeHtml(order.paymentMethod)}</strong></div>
      <div><span>Receiver</span><strong>${escapeHtml(order.receiverName)}</strong></div>
      <div><span>Phone</span><strong>${escapeHtml(order.receiverPhone)}</strong></div>
    </div>
    ${paymentMessage}
    <p class="help">${escapeHtml(order.shippingAddress)}</p>
    <div class="order-actions">
      ${canShowQr ? `<button class="btn btn-secondary btn-sm" data-show-payment-qr="${order.orderId}" data-testid="show-payment-qr-${order.orderId}">Show payment QR</button>` : ''}
      ${canUpload ? `<button class="btn btn-primary btn-sm" data-upload-qr="${order.orderId}" data-testid="upload-qr-${order.orderId}">Upload payment receipt</button>` : ''}
    </div>
  </article>`;
}

function openQrModal(orderId) {
  showModal({
    title: `Upload receipt for order #${orderId}`,
    body: `<form id="qr-form"><div class="field"><label>JPG or PNG, maximum 5 MB</label><input class="input" type="file" id="qr-file" accept="image/jpeg,image/png" required data-testid="qr-file" /></div><p class="help">A successful upload changes payment status to PENDING_VERIFICATION. Admin must confirm the receipt before the customer sees “Payment successful”.</p></form>`,
    footer: '<button class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" id="upload-qr-submit" data-testid="upload-qr-submit">Upload receipt</button>'
  });
  document.querySelector('#upload-qr-submit').addEventListener('click', async (event) => {
    const input = document.querySelector('#qr-file');
    const file = input.files[0];
    if (!file) return toast('Choose an image file.', 'error');
    if (!['image/jpeg', 'image/png'].includes(file.type)) return toast('Only JPG and PNG are accepted.', 'error');
    if (file.size > 5 * 1024 * 1024) return toast('The file exceeds 5 MB.', 'error');
    setBusy(event.currentTarget, true, 'Uploading...');
    try {
      const response = await api.uploadQr(orderId, file);
      toast(response.message || 'Receipt uploaded.');
      closeModal();
      state.orders = [];
      renderCurrentView(true);
    } catch (error) {
      toast(error.message, 'error');
      setBusy(event.currentTarget, false);
    }
  });
}

function ordersTable(orders, admin) {
  if (!orders.length) return empty('No orders found', 'Create customer orders to populate this table.');
  return `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Status</th><th>Payment</th><th>Total</th>${admin ? '<th>Receiver</th>' : ''}</tr></thead><tbody>${orders.map((order) => `<tr><td><strong>${escapeHtml(order.orderCode)}</strong></td><td>${statusBadge(order.status)}</td><td>${statusBadge(order.paymentStatus)}</td><td>${money(order.total)}</td>${admin ? `<td>${escapeHtml(order.receiverName)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

async function renderAdminOrders(container, force = false) {
  if (force || !state.adminOrders.length) state.adminOrders = await api.adminOrders();
  const config = getConfig();
  container.innerHTML = `
    <section class="card">
      <div class="card-header"><div><h3>All system orders</h3><p>COD orders do not require payment verification. QR receipts can be marked PAID or FAILED.</p></div></div>
      ${state.adminOrders.length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Order status</th><th>Payment</th><th>Total</th><th>Actions</th></tr></thead><tbody>
        ${state.adminOrders.map((order) => {
          const isQr = String(order.paymentMethod || '').toUpperCase() === 'QR_CODE';
          return `<tr data-testid="admin-order-${order.orderId}">
            <td><strong>${escapeHtml(order.orderCode)}</strong><div class="help">#${order.orderId} · ${dateTime(order.createdAt)}</div></td>
            <td>${escapeHtml(order.receiverName)}<div class="help">${escapeHtml(order.receiverPhone)}</div></td>
            <td>${statusBadge(order.status)}<select class="select" style="margin-top:7px;min-width:140px" id="status-${order.orderId}">${Object.entries(config.statusIds).map(([name,id]) => `<option value="${id}">${name} (ID ${id})</option>`).join('')}</select></td>
            <td>${statusBadge(order.paymentStatus)}<div class="help">${escapeHtml(order.paymentMethod)}</div>${isQr ? `<select class="select" style="margin-top:7px;min-width:150px" id="payment-${order.orderId}"><option value="PAID">PAID</option><option value="FAILED">FAILED</option><option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option></select>` : '<div class="help">Pay on delivery; no QR verification.</div>'}</td>
            <td>${money(order.total)}</td>
            <td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-update-status="${order.orderId}">Update status</button>${isQr ? `<button class="btn btn-success btn-sm" data-update-payment="${order.orderId}">Verify payment</button>` : ''}</div></td>
          </tr>`;
        }).join('')}
      </tbody></table></div>` : empty('No system orders', 'Create an order using a customer account.')}
    </section>`;

  container.querySelectorAll('[data-update-status]').forEach((button) => button.addEventListener('click', async () => {
    const orderId = Number(button.dataset.updateStatus);
    const statusId = Number(document.querySelector(`#status-${orderId}`).value);
    setBusy(button, true, 'Updating...');
    try {
      await api.updateOrderStatus(orderId, statusId);
      toast('Order status updated.');
      state.adminOrders = [];
      renderCurrentView();
    } catch (error) {
      toast(error.message, 'error');
      setBusy(button, false);
    }
  }));
  container.querySelectorAll('[data-update-payment]').forEach((button) => button.addEventListener('click', async () => {
    const orderId = Number(button.dataset.updatePayment);
    const paymentStatus = document.querySelector(`#payment-${orderId}`).value;
    setBusy(button, true, 'Updating...');
    try {
      await api.verifyPayment(orderId, paymentStatus);
      toast(paymentStatus === 'PAID' ? 'Payment verified successfully.' : 'Payment status updated.');
      state.adminOrders = [];
      renderCurrentView();
    } catch (error) {
      toast(error.message, 'error');
      setBusy(button, false);
    }
  }));
}

function renderTestLab(container) {
  const cases = isAdmin() ? adminTestCases() : customerTestCases();
  container.innerHTML = `
    <div class="test-grid">
      <section class="card card-pad">
        <h3 style="margin-top:0">Executable smoke checks</h3>
        <p class="help">These checks call the real API. Destructive tests are intentionally excluded from one-click execution.</p>
        ${cases.map((test) => `<div class="test-case"><h4>${escapeHtml(test.id)} — ${escapeHtml(test.title)}</h4><p>${escapeHtml(test.description)}</p><button class="btn btn-secondary btn-sm" data-run-test="${test.id}" data-testid="run-${test.id}">Run test</button><div class="test-result" id="result-${test.id}"></div></div>`).join('')}
      </section>
      <section class="api-console">
        <div class="api-console-toolbar"><strong>API evidence log</strong><button class="btn btn-ghost btn-sm" id="clear-log">Clear</button></div>
        <div class="api-log" id="api-log">${apiLogMarkup()}</div>
      </section>
    </div>`;
  document.querySelector('#clear-log').addEventListener('click', () => {
    state.apiLogs = [];
    document.querySelector('#api-log').innerHTML = apiLogMarkup();
  });
  container.querySelectorAll('[data-run-test]').forEach((button) => button.addEventListener('click', async () => {
    const test = cases.find((item) => item.id === button.dataset.runTest);
    const result = document.querySelector(`#result-${test.id}`);
    setBusy(button, true, 'Running...');
    try {
      const message = await test.run();
      result.style.color = 'var(--green)';
      result.textContent = `PASS — ${message}`;
    } catch (error) {
      result.style.color = 'var(--red)';
      result.textContent = `FAIL — ${error.message}`;
    } finally {
      setBusy(button, false);
    }
  }));
}

function customerTestCases() {
  return [
    { id: 'TC-PUB-01', title: 'Load public products', description: 'GET /api/products should return an array.', run: async () => { const data = await api.products(); if (!Array.isArray(data)) throw new Error('Response is not an array'); return `${data.length} product(s)`; } },
    { id: 'TC-AUTH-01', title: 'Authenticated cart access', description: 'GET /api/carts should return cartId, items, and totalCartPrice.', run: async () => { const data = await api.cart(); if (!Array.isArray(data.items)) throw new Error('items is not an array'); return `${data.items.length} cart item(s)`; } },
    { id: 'TC-ADDR-01', title: 'Load customer addresses', description: 'GET /api/addresses should return only the current user addresses.', run: async () => { const data = await api.addresses(); if (!Array.isArray(data)) throw new Error('Response is not an array'); return `${data.length} address(es)`; } },
    { id: 'TC-ORD-01', title: 'Load customer order history', description: 'GET /api/orders should return the current user order history.', run: async () => { const data = await api.orders(); if (!Array.isArray(data)) throw new Error('Response is not an array'); return `${data.length} order(s)`; } },
    { id: 'TC-SEC-01', title: 'Customer denied admin orders', description: 'GET /api/admin/orders should return 401/403 for a CUSTOMER token.', run: async () => { try { await api.adminOrders(); } catch (error) { if ([401,403].includes(error.status)) return `Correctly rejected with HTTP ${error.status}`; throw error; } throw new Error('Security defect: customer accessed admin orders'); } }
  ];
}

function adminTestCases() {
  return [
    { id: 'TC-PUB-01', title: 'Load public products', description: 'GET /api/products should return an array.', run: async () => { const data = await api.products(); if (!Array.isArray(data)) throw new Error('Response is not an array'); return `${data.length} product(s)`; } },
    { id: 'TC-ADM-01', title: 'Load all orders', description: 'GET /api/admin/orders should succeed for ADMIN.', run: async () => { const data = await api.adminOrders(); if (!Array.isArray(data)) throw new Error('Response is not an array'); return `${data.length} order(s)`; } },
    { id: 'TC-SEC-02', title: 'Admin denied customer cart', description: 'GET /api/carts should return 401/403 for an ADMIN token.', run: async () => { try { await api.cart(); } catch (error) { if ([401,403].includes(error.status)) return `Correctly rejected with HTTP ${error.status}`; throw error; } throw new Error('Security defect: admin accessed customer cart'); } },
    { id: 'TC-DATA-01', title: 'Product contract fields', description: 'Each product should expose the ProductResponse fields used by the UI.', run: async () => { const data = await api.products(); const invalid = data.find((p) => !('productId' in p) || !('productName' in p) || !('price' in p) || !('stock' in p)); if (invalid) throw new Error('A product is missing required fields'); return 'Product response contract is valid'; } }
  ];
}

function apiLogMarkup() {
  if (!state.apiLogs.length) return '<div class="empty" style="color:#9fb0c7"><strong style="color:white">No API calls captured</strong>Use the application or run a smoke test.</div>';
  return state.apiLogs.map((log) => `<div class="log-item"><div class="log-head"><span class="log-method">${escapeHtml(log.method)}</span><span class="log-status ${log.ok ? 'ok' : 'fail'}">${log.status || 'NETWORK'}</span><span>${log.durationMs} ms</span><span class="log-path">${escapeHtml(log.path)}</span></div><details><summary>Request / response</summary><pre>${escapeHtml(JSON.stringify({ request: log.requestBody, response: log.response }, null, 2))}</pre></details></div>`).join('');
}

function renderSettings(container) {
  const config = getConfig();
  container.innerHTML = `
    <div class="grid grid-2">
      <section class="card card-pad">
        <h3 style="margin-top:0">API configuration</h3>
        <form id="settings-form" data-testid="settings-form">
          <div class="field"><label>API base URL</label><input class="input" name="apiBaseUrl" value="${escapeHtml(config.apiBaseUrl)}" placeholder="Leave blank for Vite proxy" data-testid="api-base-url" /><p class="help">Recommended: blank. Requests remain under /api and Vite proxies them to http://localhost:8080.</p></div>
          <div class="form-grid" style="margin-top:14px">
            <div class="field"><label>Default category ID</label><input class="input" type="number" min="1" name="categoryId" value="${config.categoryId}" /></div>
            <div class="field"><label>COD payment method ID</label><input class="input" type="number" min="1" name="paymentMethodCodId" value="${config.paymentMethodCodId}" /></div>
            <div class="field"><label>QR_CODE payment method ID</label><input class="input" type="number" min="1" name="paymentMethodQrId" value="${config.paymentMethodQrId}" /></div>
          </div>
          <h4>Order status IDs</h4>
          <div class="form-grid">${Object.entries(config.statusIds).map(([name,id]) => `<div class="field"><label>${name}</label><input class="input" type="number" min="1" name="status_${name}" value="${id}" /></div>`).join('')}</div>
          <div class="form-actions"><button class="btn btn-primary" type="submit" data-testid="save-settings">Save settings</button></div>
        </form>
      </section>
      <section class="card card-pad">
        <h3 style="margin-top:0">Backend limitations detected</h3>
        <div class="test-case"><h4>No category-list endpoint</h4><p>Admin product forms require a numeric categoryId. Configure a valid ID here.</p></div>
        <div class="test-case"><h4>No payment-method endpoint</h4><p>Checkout requires a numeric paymentMethodId. Defaults assume COD=1 and QR_CODE=2.</p></div>
        <div class="test-case"><h4>No order-status endpoint</h4><p>Admin status updates require a numeric statusId. Defaults assume PENDING through CANCELLED use IDs 1–5.</p></div>
        <div class="test-case"><h4>Address response exposes User entity</h4><p>The frontend ignores nested user data and the API console redacts password, token, and hash fields.</p></div>
      </section>
    </div>`;
  document.querySelector('#settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = {
      apiBaseUrl: data.get('apiBaseUrl').trim(),
      categoryId: Number(data.get('categoryId')),
      paymentMethodCodId: Number(data.get('paymentMethodCodId')),
      paymentMethodQrId: Number(data.get('paymentMethodQrId')),
      statusIds: Object.fromEntries(['PENDING','PROCESSING','SHIPPED','DELIVERED','CANCELLED'].map((name) => [name, Number(data.get(`status_${name}`))]))
    };
    saveConfig(next);
    toast('Environment settings saved.');
  });
}

window.addEventListener('swt-api-log', (event) => {
  state.apiLogs.unshift(event.detail);
  state.apiLogs = state.apiLogs.slice(0, 100);
  const log = document.querySelector('#api-log');
  if (log) log.innerHTML = apiLogMarkup();
});

renderAuth();
if (state.session) renderShell();
