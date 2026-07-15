const SESSION_KEY = 'swt301_session';
const CONFIG_KEY = 'swt301_frontend_config';

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getConfig() {
  const defaults = {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
    categoryId: 1,
    paymentMethodCodId: 1,
    paymentMethodQrId: 2,
    statusIds: {
      PENDING: 7,
      PROCESSING: 8,
      SHIPPED: 11,
      DELIVERED: 12,
      CANCELLED: 13
    }
  };

  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    return {
      ...defaults,
      ...saved,
      statusIds: { ...defaults.statusIds, ...(saved.statusIds || {}) }
    };
  } catch {
    return defaults;
  }
}

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function buildUrl(path) {
  const base = getConfig().apiBaseUrl.trim().replace(/\/$/, '');
  return `${base}${path}`;
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

export async function apiRequest(path, options = {}) {
  const session = getSession();
  const method = options.method || 'GET';
  const isFormData = options.body instanceof FormData;
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
      method,
      headers,
      body: isFormData
        ? options.body
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body)
    });

    const text = await response.text();
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
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
  login: (username, password) => apiRequest('/api/auth/login', {
    method: 'POST',
    body: { username, password }
  }),
  register: (payload) => apiRequest('/api/auth/register', {
    method: 'POST',
    body: payload
  }),
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
  voucher: (code, subtotal) => apiRequest(
    `/api/vouchers/check?code=${encodeURIComponent(code)}&orderSubtotal=${encodeURIComponent(subtotal)}`
  ),
  previewOrder: (voucherCode = '') => apiRequest(
    `/api/orders/preview${voucherCode ? `?voucherCode=${encodeURIComponent(voucherCode)}` : ''}`
  ),
  checkout: (payload) => apiRequest('/api/orders/checkout', { method: 'POST', body: payload }),
  orders: () => apiRequest('/api/orders'),
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
