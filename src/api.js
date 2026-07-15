const SESSION_KEY = 'swt301_session';
const CONFIG_KEY = 'swt301_frontend_config';
const LEGACY_AUTH_KEYS = ['token', 'jwt', 'authToken', 'user', 'swt301_token'];
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

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

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
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
  if (!isSessionUsable(session)) {
    throw new Error('The backend returned a malformed or expired JWT.');
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  LEGACY_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function getConfig() {
  const defaults = {
    apiBaseUrl: API_BASE_URL,
    categoryId: 1
  };

  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    const categoryId = Number(saved.categoryId);
    return {
      ...defaults,
      categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : defaults.categoryId
    };
  } catch {
    return defaults;
  }
}

export function saveConfig(config) {
  const categoryId = Number(config?.categoryId);
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : 1
  }));
}

function buildUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function extractErrorMessage(payload, status) {
  if (payload?.errors && typeof payload.errors === 'object') {
    return Object.entries(payload.errors)
      .map(([field, message]) => `${field}: ${message}`)
      .join(' | ');
  }
  return payload?.message || payload?.error || `Request failed with HTTP ${status}`;
}

function sanitizeForLog(value) {
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Blob) return `[Blob ${value.type || 'application/octet-stream'}, ${value.size} bytes]`;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const normalized = key.toLowerCase();
    if (normalized.includes('password') || normalized.includes('token') || normalized.includes('hash')) {
      return [key, '[REDACTED]'];
    }
    return [key, sanitizeForLog(item)];
  }));
}

function emitApiLog(detail) {
  window.dispatchEvent(new CustomEvent('swt-api-log', {
    detail: {
      ...detail,
      requestBody: sanitizeForLog(detail.requestBody),
      response: sanitizeForLog(detail.response)
    }
  }));
}

function emitAuthExpired() {
  window.dispatchEvent(new CustomEvent('swt-auth-expired'));
}

export async function apiRequest(path, options = {}) {
  const hadStoredSession = Boolean(localStorage.getItem(SESSION_KEY));
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

  if (!isFormData && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (session?.token) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  const requestBody = isFormData
    ? '[multipart/form-data]'
    : options.body === undefined
      ? null
      : options.body;

  const startedAt = performance.now();
  let response;
  let payload;

  try {
    response = await fetch(buildUrl(path), {
      ...options,
      responseType: undefined,
      method,
      headers,
      body: isFormData
        ? options.body
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body)
    });

    if (responseType === 'blob' && response.ok) {
      payload = await response.blob();
    } else {
      const text = await response.text();
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
    }

    emitApiLog({
      timestamp: new Date().toISOString(),
      method,
      path,
      requestBody,
      status: response.status,
      ok: response.ok,
      durationMs: Math.round(performance.now() - startedAt),
      response: payload
    });

    if (!response.ok) {
      const error = new Error(extractErrorMessage(payload, response.status));
      error.status = response.status;
      error.payload = payload;
      if (response.status === 401 && session?.token) {
        clearSession();
        error.authExpired = true;
        emitAuthExpired();
      }
      throw error;
    }

    return payload;
  } catch (error) {
    if (!response) {
      emitApiLog({
        timestamp: new Date().toISOString(),
        method,
        path,
        requestBody,
        status: 0,
        ok: false,
        durationMs: Math.round(performance.now() - startedAt),
        response: { message: error.message }
      });
      const networkError = new Error(
        'Cannot reach the backend. Start Spring Boot on port 8080 and run this frontend with npm run dev.'
      );
      networkError.cause = error;
      throw networkError;
    }
    throw error;
  }
}

export const api = {
  login: (identifier, password) => apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username: identifier, password }
  }),
  register: (payload) => apiRequest('/api/auth/register', {
    method: 'POST',
    body: payload
  }),
  profile: () => apiRequest('/api/profile'),
  updateProfile: (payload) => apiRequest('/api/profile', { method: 'PUT', body: payload }),
  products: () => apiRequest('/api/products'),
  product: (id) => apiRequest(`/api/products/${id}`),
  createProduct: (formData) => apiRequest('/api/admin/products', { method: 'POST', body: formData }),
  updateProduct: (id, formData) => apiRequest(`/api/admin/products/${id}`, { method: 'PUT', body: formData }),
  deleteProduct: (id) => apiRequest(`/api/admin/products/${id}`, { method: 'DELETE' }),
  cart: () => apiRequest('/api/carts'),
  addCartItem: (productId, quantity) => apiRequest('/api/carts/items', {
    method: 'POST',
    body: { productId, quantity }
  }),
  updateCartItem: (productId, quantity) => apiRequest('/api/carts/items', {
    method: 'PUT',
    body: { productId, quantity }
  }),
  removeCartItem: (cartItemId) => apiRequest(`/api/carts/items/${cartItemId}`, { method: 'DELETE' }),
  addresses: () => apiRequest('/api/addresses'),
  createAddress: (payload) => apiRequest('/api/addresses', { method: 'POST', body: payload }),
  updateAddress: (id, payload) => apiRequest(`/api/addresses/${id}`, { method: 'PUT', body: payload }),
  deleteAddress: (id) => apiRequest(`/api/addresses/${id}`, { method: 'DELETE' }),
  voucher: (code, subtotal) => apiRequest(
    `/api/vouchers/check?code=${encodeURIComponent(code)}&orderSubtotal=${encodeURIComponent(subtotal)}`
  ),
  previewOrder: (voucherCode = '') => apiRequest(
    `/api/orders/preview${voucherCode ? `?voucherCode=${encodeURIComponent(voucherCode)}` : ''}`
  ),
  checkout: (payload) => apiRequest('/api/orders/checkout', { method: 'POST', body: payload }),
  orders: () => apiRequest('/api/orders'),
  paymentMethods: () => apiRequest('/api/reference/payment-methods'),
  orderStatuses: () => apiRequest('/api/reference/order-statuses'),
  paymentQrInfo: (orderId) => apiRequest(`/api/orders/${orderId}/payment/qr-info`),
  paymentQrCode: (orderId) => apiRequest(`/api/orders/${orderId}/payment/qr-code`, { responseType: 'blob' }),
  uploadQr: (orderId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest(`/api/orders/${orderId}/payment/qr`, { method: 'POST', body: formData });
  },
  adminOrders: () => apiRequest('/api/admin/orders'),
  updateOrderStatus: (orderId, statusId) => apiRequest(
    `/api/admin/orders/${orderId}/status?statusId=${encodeURIComponent(statusId)}`,
    { method: 'PUT' }
  ),
  verifyPayment: (orderId, paymentStatus) => apiRequest(
    `/api/admin/orders/${orderId}/payment?paymentStatus=${encodeURIComponent(paymentStatus)}`,
    { method: 'PUT' }
  )
};
