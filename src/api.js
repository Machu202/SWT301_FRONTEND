const SESSION_KEY = 'swt301_session';
const LEGACY_AUTH_KEYS = ['token', 'jwt', 'authToken', 'user', 'swt301_token', SESSION_KEY];
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);
const API_LOG_ENABLED = import.meta.env.MODE !== 'production'
  || String(import.meta.env.VITE_ENABLE_API_LOGS || '').toLowerCase() === 'true';

let requestScope = new AbortController();

function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(decodeURIComponent(Array.from(atob(normalized + padding))
      .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')));
  } catch {
    return null;
  }
}

export function isSessionUsable(session) {
  if (!session || typeof session !== 'object' || typeof session.token !== 'string') return false;
  const payload = decodeJwtPayload(session.token);
  if (!payload || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return false;
  return payload.exp * 1000 > Date.now();
}

function clearLegacyLocalStorage() {
  LEGACY_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function getSession() {
  clearLegacyLocalStorage();
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!isSessionUsable(session)) {
      clearSession();
      emitAuthExpired();
      return null;
    }
    return session;
  } catch {
    clearSession();
    emitAuthExpired();
    return null;
  }
}

export function saveSession(session) {
  if (!isSessionUsable(session)) throw new Error('The backend returned a malformed or expired JWT.');
  clearLegacyLocalStorage();
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  clearLegacyLocalStorage();
}

export function getConfig() {
  return {
    apiBaseUrl: API_BASE_URL,
    requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    apiLogEnabled: API_LOG_ENABLED
  };
}

export function startRequestScope() {
  requestScope.abort(new DOMException('View changed', 'AbortError'));
  requestScope = new AbortController();
  return requestScope.signal;
}

export function cancelRequestScope() {
  requestScope.abort(new DOMException('View changed', 'AbortError'));
}

export function isApiLogEnabled() {
  return API_LOG_ENABLED;
}

function buildUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function extractErrorMessage(payload, status) {
  if (payload?.errors && typeof payload.errors === 'object') {
    return Object.entries(payload.errors).map(([field, message]) => `${field}: ${message}`).join(' | ');
  }
  return payload?.message || payload?.error || `Request failed with HTTP ${status}`;
}

const SENSITIVE_KEYS = [
  'password', 'token', 'hash', 'email', 'phone', 'address', 'street', 'ward', 'district', 'province',
  'receiver', 'fullname', 'full_name', 'username', 'receipt', 'qrimage', 'qrurl', 'note', 'accountnumber'
];

function sanitizeForLog(value) {
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Blob) return `[Blob ${value.type || 'application/octet-stream'}, ${value.size} bytes]`;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYS.some((term) => normalized.includes(term))) return [key, '[REDACTED]'];
    return [key, sanitizeForLog(item)];
  }));
}

function sanitizePath(path) {
  try {
    const url = new URL(path, 'http://local.invalid');
    for (const key of [...url.searchParams.keys()]) {
      if (/voucher|email|phone|token|address|receipt/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return String(path).replace(/(voucherCode=)[^&]+/gi, '$1[REDACTED]');
  }
}

function emitApiLog(detail) {
  if (!API_LOG_ENABLED) return;
  window.dispatchEvent(new CustomEvent('swt-api-log', {
    detail: {
      ...detail,
      path: sanitizePath(detail.path),
      requestBody: sanitizeForLog(detail.requestBody),
      response: sanitizeForLog(detail.response)
    }
  }));
}

function emitAuthExpired() {
  window.dispatchEvent(new CustomEvent('swt-auth-expired'));
}

function combinedSignal(signals) {
  const controller = new AbortController();
  const abort = (signal) => {
    if (!controller.signal.aborted) controller.abort(signal?.reason || new DOMException('Aborted', 'AbortError'));
  };
  signals.filter(Boolean).forEach((signal) => {
    if (signal.aborted) abort(signal);
    else signal.addEventListener('abort', () => abort(signal), { once: true });
  });
  return controller.signal;
}

export async function apiRequest(path, options = {}) {
  const hadStoredSession = Boolean(sessionStorage.getItem(SESSION_KEY));
  const session = getSession();
  if (hadStoredSession && !session) {
    const error = new Error('Session expired or token is invalid.');
    error.status = 401;
    error.authExpired = true;
    throw error;
  }

  const method = options.method || 'GET';
  const isFormData = options.body instanceof FormData;
  const responseType = options.responseType || 'json';
  const headers = new Headers(options.headers || {});
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
  const signal = combinedSignal([requestScope.signal, options.signal, timeoutController.signal]);

  if (!isFormData && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);

  const requestBody = isFormData ? '[multipart/form-data]' : options.body ?? null;
  const startedAt = performance.now();
  let response;
  let payload;

  try {
    response = await fetch(buildUrl(path), {
      method,
      headers,
      signal,
      body: isFormData ? options.body : options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (responseType === 'blob' && response.ok) payload = await response.blob();
    else {
      const text = await response.text();
      try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    }

    emitApiLog({
      timestamp: new Date().toISOString(), method, path, requestBody,
      status: response.status, ok: response.ok,
      durationMs: Math.round(performance.now() - startedAt), response: payload
    });

    if (!response.ok) {
      const error = new Error(extractErrorMessage(payload, response.status));
      error.status = response.status;
      error.payload = payload;
      if (response.status === 401 && session?.token) {
        clearSession();
        cancelRequestScope();
        error.authExpired = true;
        emitAuthExpired();
      }
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || signal.aborted) {
      const reasonName = timeoutController.signal.aborted ? 'TimeoutError' : 'AbortError';
      const aborted = new Error(reasonName === 'TimeoutError'
        ? `The request exceeded the ${Math.round(timeoutMs / 1000)} second timeout.`
        : 'The request was cancelled because the screen changed.');
      aborted.name = reasonName;
      aborted.cancelled = reasonName === 'AbortError';
      aborted.status = 0;
      if (reasonName === 'TimeoutError') {
        emitApiLog({ timestamp: new Date().toISOString(), method, path, requestBody, status: 0, ok: false,
          durationMs: Math.round(performance.now() - startedAt), response: { message: aborted.message } });
      }
      throw aborted;
    }
    if (!response) {
      emitApiLog({ timestamp: new Date().toISOString(), method, path, requestBody, status: 0, ok: false,
        durationMs: Math.round(performance.now() - startedAt), response: { message: error.message } });
      const networkError = new Error('Cannot reach the backend or the connection was interrupted.');
      networkError.cause = error;
      networkError.status = 0;
      throw networkError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const query = (values) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
};

export const api = {
  login: (identifier, password) => apiRequest('/api/auth/login', { method: 'POST', body: { username: identifier, password } }),
  register: (payload) => apiRequest('/api/auth/register', { method: 'POST', body: payload }),
  profile: () => apiRequest('/api/profile'),
  updateProfile: (payload) => apiRequest('/api/profile', { method: 'PUT', body: payload }),

  products: () => apiRequest('/api/products'),
  productsPage: ({ page = 0, size = 12, search = '', categoryId = null } = {}) =>
    apiRequest(`/api/products/page${query({ page, size, search, categoryId })}`),
  adminProductsPage: ({ page = 0, size = 12, search = '', categoryId = null } = {}) =>
    apiRequest(`/api/admin/products${query({ page, size, search, categoryId })}`),
  product: (id) => apiRequest(`/api/products/${id}`),
  categories: () => apiRequest('/api/reference/categories'),
  createProduct: (formData) => apiRequest('/api/admin/products', { method: 'POST', body: formData, timeoutMs: 30000 }),
  updateProduct: (id, formData) => apiRequest(`/api/admin/products/${id}`, { method: 'PUT', body: formData, timeoutMs: 30000 }),
  deleteProduct: (id) => apiRequest(`/api/admin/products/${id}`, { method: 'DELETE' }),

  cart: () => apiRequest('/api/carts'),
  addCartItem: (productId, quantity) => apiRequest('/api/carts/items', { method: 'POST', body: { productId, quantity } }),
  updateCartItem: (productId, quantity) => apiRequest('/api/carts/items', { method: 'PUT', body: { productId, quantity } }),
  removeCartItem: (cartItemId) => apiRequest(`/api/carts/items/${cartItemId}`, { method: 'DELETE' }),
  clearCart: () => apiRequest('/api/carts/items', { method: 'DELETE' }),

  addresses: () => apiRequest('/api/addresses'),
  createAddress: (payload) => apiRequest('/api/addresses', { method: 'POST', body: payload }),
  updateAddress: (id, payload) => apiRequest(`/api/addresses/${id}`, { method: 'PUT', body: payload }),
  deleteAddress: (id) => apiRequest(`/api/addresses/${id}`, { method: 'DELETE' }),

  previewOrder: (voucherCode = '') => apiRequest(`/api/orders/preview${query({ voucherCode })}`),
  checkout: (payload, idempotencyKey) => apiRequest('/api/orders/checkout', {
    method: 'POST', body: payload, headers: { 'Idempotency-Key': idempotencyKey }, timeoutMs: 25000
  }),
  orders: () => apiRequest('/api/orders'),
  ordersPage: ({ page = 0, size = 10 } = {}) => apiRequest(`/api/orders/page${query({ page, size })}`),
  paymentMethods: () => apiRequest('/api/reference/payment-methods'),
  orderStatuses: () => apiRequest('/api/reference/order-statuses'),
  paymentQrInfo: (orderId) => apiRequest(`/api/orders/${orderId}/payment/qr-info`),
  paymentQrCode: (orderId) => apiRequest(`/api/orders/${orderId}/payment/qr-code`, { responseType: 'blob' }),
  customerReceipt: (orderId) => apiRequest(`/api/orders/${orderId}/payment/receipt`, { responseType: 'blob' }),
  uploadQr: (orderId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest(`/api/orders/${orderId}/payment/qr`, { method: 'POST', body: formData, timeoutMs: 30000 });
  },

  adminOrders: () => apiRequest('/api/admin/orders'),
  adminOrderMetrics: () => apiRequest('/api/admin/orders/metrics'),
  adminOrdersPage: ({ page = 0, size = 10 } = {}) => apiRequest(`/api/admin/orders/page${query({ page, size })}`),
  adminReceipt: (orderId) => apiRequest(`/api/admin/orders/${orderId}/payment/receipt`, { responseType: 'blob' }),
  adminPaymentQrInfo: (orderId) => apiRequest(`/api/admin/orders/${orderId}/payment/qr-info`),
  adminPaymentQrCode: (orderId) => apiRequest(`/api/admin/orders/${orderId}/payment/qr-code`, { responseType: 'blob' }),
  updateOrderStatus: (orderId, statusId) => apiRequest(`/api/admin/orders/${orderId}/status${query({ statusId })}`, { method: 'PUT' }),
  verifyPayment: (orderId, paymentStatus) => apiRequest(`/api/admin/orders/${orderId}/payment${query({ paymentStatus })}`, { method: 'PUT' })
};
