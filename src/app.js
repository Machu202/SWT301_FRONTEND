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
  checkoutPreview: null
};

const role = () => state.session?.role?.replace('ROLE_', '') || '';
const isAdmin = () => role() === 'ADMIN';
const isCustomer = () => role() === 'CUSTOMER';

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
  document.querySelector('#active-modal')?.remove();
}

function navItems() {
  if (isAdmin()) {
    return [
      ['dashboard', '▦', 'Dashboard'],
      ['admin-products', '□', 'Products'],
      ['admin-orders', '≡', 'Orders'],
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
      <div class="field">
        <label for="login-username">Username</label>
        <input class="input" id="login-username" name="username" required autocomplete="username" data-testid="login-username" />
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
      <div class="form-grid">
        <div class="field"><label>Username</label><input class="input" name="username" minlength="3" maxlength="50" required data-testid="register-username" /></div>
        <div class="field"><label>Full name</label><input class="input" name="fullName" required data-testid="register-full-name" /></div>
        <div class="field"><label>Email</label><input class="input" name="email" type="email" required data-testid="register-email" /></div>
        <div class="field"><label>Phone</label><input class="input" name="phone" placeholder="0912345678" data-testid="register-phone" /></div>
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
      const response = await api.login(data.get('username').trim(), data.get('password'));
      const session = {
        token: response.token,
        id: response.id,
        username: response.username,
        email: response.email,
        role: response.role
      };
      saveSession(session);
      state.session = session;
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
    setBusy(button, true, 'Registering...');
    try {
      const response = await api.register(payload);
      toast(response.message || 'Registration completed.');
      state.authTab = 'login';
      renderAuth();
      setTimeout(() => {
        const username = document.querySelector('#login-username');
        if (username) username.value = payload.username;
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
      state.view = button.dataset.view;
      renderShell();
    });
  });
  document.querySelector('#logout-button').addEventListener('click', () => {
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
    ${filtered.length ? `<div class="products">${filtered.map((product) => productCard(product, adminMode)).join('')}</div>` : `<div class="card">${empty('No products found', 'Adjust the search/filter or add products through the admin account.')}</div>`}`;

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

function productCard(product, adminMode) {
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
        <div class="product-meta"><span class="price">${money(product.price)}</span><span class="stock">Stock: ${escapeHtml(product.stock)}</span></div>
        ${adminMode ? `
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" data-edit-product="${product.productId}" data-testid="edit-product-${product.productId}">Edit</button>
            <button class="btn btn-danger btn-sm" data-delete-product="${product.productId}" data-testid="delete-product-${product.productId}">Delete</button>
          </div>` : `
          <div class="product-actions">
            <input class="input" type="number" min="1" max="${Math.max(1, product.stock)}" value="1" id="qty-${product.productId}" aria-label="Quantity" data-testid="quantity-${product.productId}" />
            <button class="btn btn-primary" data-add-product="${product.productId}" ${product.stock < 1 ? 'disabled' : ''} data-testid="add-cart-${product.productId}">${product.stock < 1 ? 'Out of stock' : 'Add to cart'}</button>
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
      if (!Number.isInteger(quantity) || quantity < 1) return toast('Quantity must be an integer greater than 0.', 'error');
      setBusy(button, true, 'Adding...');
      try {
        state.cart = await api.addCartItem(productId, quantity);
        toast('Product added to the real backend cart.');
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
              <td><input class="input" style="width:90px" type="number" min="1" value="${item.quantity}" id="cart-qty-${item.productId}" data-testid="cart-quantity-${item.productId}" /></td>
              <td>${money(item.itemSubtotal)}</td>
              <td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-update-cart="${item.productId}">Update</button><button class="btn btn-danger btn-sm" data-remove-cart="${item.cartItemId}">Remove</button></div></td>
            </tr>`).join('')}</tbody>
        </table></div>
        <div class="card-pad" style="display:flex;justify-content:flex-end;gap:10px"><button class="btn btn-primary" id="go-checkout">Continue to checkout</button></div>`
        : empty('Your cart is empty', 'Add products from the catalog to begin the checkout workflow.')}
    </section>`;

  container.querySelectorAll('[data-update-cart]').forEach((button) => button.addEventListener('click', async () => {
    const productId = Number(button.dataset.updateCart);
    const quantity = Number(document.querySelector(`#cart-qty-${productId}`).value);
    if (!Number.isInteger(quantity) || quantity < 1) return toast('Quantity must be at least 1.', 'error');
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
}

function addressCard(address) {
  return `<article class="card card-pad" data-testid="address-${address.addressId}">
    <div style="display:flex;justify-content:space-between;gap:10px"><strong>${escapeHtml(address.receiverName)}</strong>${address.isDefault ? '<span class="badge badge-green">Default</span>' : ''}</div>
    <p class="help">${escapeHtml(address.receiverPhone)}</p>
    <p style="font-size:13px;line-height:1.6">${escapeHtml(address.street)}, ${escapeHtml(address.ward)}, ${escapeHtml(address.district)}, ${escapeHtml(address.province)}</p>
    <button class="btn btn-secondary btn-sm" data-edit-address="${address.addressId}">Edit address</button>
  </article>`;
}

function openAddressModal(address = null) {
  showModal({
    title: address ? 'Edit address' : 'Create address',
    body: `
      <form id="address-form" data-testid="address-form">
        <div class="form-grid">
          <div class="field"><label>Receiver name</label><input class="input" name="receiverName" value="${escapeHtml(address?.receiverName || '')}" required data-testid="receiver-name" /></div>
          <div class="field"><label>Vietnamese phone</label><input class="input" name="receiverPhone" value="${escapeHtml(address?.receiverPhone || '')}" pattern="^(0|84)(3|5|7|8|9)[0-9]{8}$" required data-testid="receiver-phone" /></div>
          <div class="field"><label>Province / City</label><input class="input" name="province" value="${escapeHtml(address?.province || '')}" required data-testid="province" /></div>
          <div class="field"><label>District</label><input class="input" name="district" value="${escapeHtml(address?.district || '')}" required data-testid="district" /></div>
          <div class="field"><label>Ward</label><input class="input" name="ward" value="${escapeHtml(address?.ward || '')}" required data-testid="ward" /></div>
          <div class="field"><label>Street / House number</label><input class="input" name="street" value="${escapeHtml(address?.street || '')}" required data-testid="street" /></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:15px"><input type="checkbox" name="isDefault" ${address?.isDefault ? 'checked' : ''} /> Set as default address</label>
        <p class="help">Accepted phone format from the backend: 0/84 + 3,5,7,8,9 + eight digits.</p>
      </form>`,
    footer: `<button class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" id="save-address" data-testid="save-address">Save address</button>`
  });
  document.querySelector('#save-address').addEventListener('click', async (event) => {
    const form = document.querySelector('#address-form');
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const payload = {
      receiverName: data.get('receiverName').trim(),
      receiverPhone: data.get('receiverPhone').trim(),
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

async function renderCheckout(container, force = false) {
  const [cart, addresses] = await Promise.all([
    force || !state.cart ? api.cart() : Promise.resolve(state.cart),
    force || !state.addresses.length ? api.addresses() : Promise.resolve(state.addresses)
  ]);
  state.cart = cart;
  state.addresses = addresses;
  const config = getConfig();

  if (!cart.items?.length) {
    container.innerHTML = `<div class="card">${empty('Checkout unavailable', 'The backend requires at least one cart item.')}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="grid grid-2">
      <section class="card card-pad">
        <h3 style="margin-top:0">Order details</h3>
        <form id="checkout-form" data-testid="checkout-form">
          <div class="field"><label>Delivery address</label><select class="select" name="addressId" required data-testid="checkout-address"><option value="">Select address</option>${state.addresses.map((a) => `<option value="${a.addressId}" ${a.isDefault ? 'selected' : ''}>${escapeHtml(a.receiverName)} — ${escapeHtml(a.street)}, ${escapeHtml(a.ward)}</option>`).join('')}</select></div>
          <div class="field" style="margin-top:14px"><label>Payment method</label><select class="select" name="paymentMethodId" required data-testid="payment-method"><option value="${config.paymentMethodCodId}">COD (database ID ${config.paymentMethodCodId})</option><option value="${config.paymentMethodQrId}">QR_CODE (database ID ${config.paymentMethodQrId})</option></select></div>
          <div class="field" style="margin-top:14px"><label>Voucher code</label><div style="display:flex;gap:8px"><input class="input" name="voucherCode" id="checkout-voucher" value="${escapeHtml(state.checkoutVoucher)}" placeholder="Optional" data-testid="checkout-voucher" /><button type="button" class="btn btn-secondary" id="preview-order" data-testid="preview-order">Preview</button></div></div>
          <div class="field" style="margin-top:14px"><label>Order note</label><textarea class="textarea" name="note" maxlength="500" data-testid="checkout-note"></textarea></div>
          ${state.addresses.length ? '' : '<p class="error-text">Create an address before placing an order.</p>'}
          <button class="btn btn-primary" type="submit" style="width:100%;margin-top:18px" ${state.addresses.length ? '' : 'disabled'} data-testid="place-order">Place real order</button>
        </form>
      </section>
      <section class="card">
        <div class="card-header"><div><h3>Price preview</h3><p>Calculated by the backend, not the browser</p></div></div>
        <div id="preview-panel">${state.checkoutPreview ? previewMarkup(state.checkoutPreview) : '<div class="card-pad"><p class="help">Click Preview to execute GET /api/orders/preview.</p></div>'}</div>
      </section>
    </div>`;

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

  document.querySelector('#checkout-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (!confirm('Create this order in the real backend and clear the current cart?')) return;
    const data = new FormData(event.currentTarget);
    const payload = {
      addressId: Number(data.get('addressId')),
      paymentMethodId: Number(data.get('paymentMethodId')),
      voucherCode: data.get('voucherCode').trim() || null,
      note: data.get('note').trim()
    };
    setBusy(event.submitter, true, 'Creating order...');
    try {
      const order = await api.checkout(payload);
      toast(`Order ${order.orderCode} created.`);
      state.cart = null;
      state.checkoutPreview = null;
      state.checkoutVoucher = '';
      state.view = 'orders';
      renderShell();
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

async function renderOrders(container, force = false) {
  if (force || !state.orders.length) state.orders = await api.orders();
  container.innerHTML = `<div class="grid">${state.orders.length ? state.orders.map(orderCard).join('') : `<div class="card">${empty('No order history', 'Complete checkout to create an order.')}</div>`}</div>`;
  container.querySelectorAll('[data-upload-qr]').forEach((button) => button.addEventListener('click', () => openQrModal(Number(button.dataset.uploadQr))));
}

function orderCard(order) {
  const canUpload = String(order.paymentMethod).toUpperCase() === 'QR_CODE' && ['AWAITING_PAYMENT', 'FAILED'].includes(String(order.paymentStatus).toUpperCase());
  return `<article class="card order-card" data-testid="order-${order.orderId}">
    <div class="order-head"><div><h3>${escapeHtml(order.orderCode)}</h3><p>${dateTime(order.createdAt)}</p></div><div style="display:flex;gap:7px;flex-wrap:wrap">${statusBadge(order.status)}${statusBadge(order.paymentStatus)}</div></div>
    <div class="order-meta">
      <div><span>Total</span><strong>${money(order.total)}</strong></div>
      <div><span>Payment</span><strong>${escapeHtml(order.paymentMethod)}</strong></div>
      <div><span>Receiver</span><strong>${escapeHtml(order.receiverName)}</strong></div>
      <div><span>Phone</span><strong>${escapeHtml(order.receiverPhone)}</strong></div>
    </div>
    <p class="help">${escapeHtml(order.shippingAddress)}</p>
    <div class="order-actions">${canUpload ? `<button class="btn btn-primary btn-sm" data-upload-qr="${order.orderId}" data-testid="upload-qr-${order.orderId}">Upload QR receipt</button>` : ''}</div>
  </article>`;
}

function openQrModal(orderId) {
  showModal({
    title: `Upload receipt for order #${orderId}`,
    body: `<form id="qr-form"><div class="field"><label>JPG or PNG, maximum 5 MB</label><input class="input" type="file" id="qr-file" accept="image/jpeg,image/png" required data-testid="qr-file" /></div><p class="help">A successful upload changes payment status to PENDING_VERIFICATION.</p></form>`,
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
      renderCurrentView();
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
      <div class="card-header"><div><h3>All system orders</h3><p>Status IDs are configurable in Settings because the backend has no status-list endpoint.</p></div></div>
      ${state.adminOrders.length ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Order status</th><th>Payment</th><th>Total</th><th>Actions</th></tr></thead><tbody>
        ${state.adminOrders.map((order) => `<tr data-testid="admin-order-${order.orderId}"><td><strong>${escapeHtml(order.orderCode)}</strong><div class="help">#${order.orderId} · ${dateTime(order.createdAt)}</div></td><td>${escapeHtml(order.receiverName)}<div class="help">${escapeHtml(order.receiverPhone)}</div></td><td>${statusBadge(order.status)}<select class="select" style="margin-top:7px;min-width:140px" id="status-${order.orderId}">${Object.entries(config.statusIds).map(([name,id]) => `<option value="${id}">${name} (ID ${id})</option>`).join('')}</select></td><td>${statusBadge(order.paymentStatus)}<select class="select" style="margin-top:7px;min-width:150px" id="payment-${order.orderId}"><option value="PAID">PAID</option><option value="FAILED">FAILED</option><option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option></select></td><td>${money(order.total)}</td><td><div class="table-actions"><button class="btn btn-secondary btn-sm" data-update-status="${order.orderId}">Update status</button><button class="btn btn-success btn-sm" data-update-payment="${order.orderId}">Update payment</button></div></td></tr>`).join('')}
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
      toast('Payment status updated.');
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
