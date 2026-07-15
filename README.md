# SWT301 E-commerce Testing Frontend

A Vite frontend connected to the SWT301 Spring Boot backend. It is intended for manual, integration, authorization, boundary-value, and workflow testing with real database data.

## Implemented workflows

### Authentication and session security

- Customer registration and Customer/Admin login
- Show/Hide password on Login and Register
- Strict role validation; unknown roles are never treated as Customer
- JWT stored in `sessionStorage`, not `localStorage`
- JWT structure and `exp` checked before the dashboard opens
- Logout and authenticated HTTP 401 clear the whole client state, cancel active requests, and stop payment polling
- API destination fixed at build time; Settings cannot redirect JWT requests

### Customer

- Paginated ACTIVE product catalog with 250 ms search debounce
- Independent category reference endpoint
- Cart add/update/remove, confirmation before removal, and Clear Cart
- Saved addresses or manual checkout address snapshots
- Automatic voucher preview using current backend prices
- COD and QR radio-button payment selection using IDs returned by the backend
- Idempotent checkout requests
- Order-specific dynamic VietQR generated for the exact amount and order code
- Protected receipt upload/viewing
- Paginated order history with immutable address, voucher, item lines, receipt upload time, and verification time

### Admin

- Paginated products and orders
- Category selection from the backend; no browser-stored default category ID
- Product image preview, filename/type/size, remove selected file, replace image, or remove current image
- Product deactivation instead of physical deletion
- Backend-provided order statuses with current status selected
- Protected receipt preview before payment verification
- Backend-enforced payment and order state rules

### Reliability and testing

- Per-request timeout using `AbortController`
- Requests cancelled when changing screens
- Dashboard displays a separate error for each failed API area
- Admin Testing Readiness tracks actual request success/failure
- API evidence log enabled only in development/test by default, with personal data redacted
- Test Lab includes Product, Cart CRUD, Voucher preview, Checkout, Receipt, Payment verification, and Order-status checks

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+
- Backend running at `http://localhost:8080`

## Run locally

```powershell
npm ci
npm run dev
```

Open `http://localhost:5173`. The Vite proxy forwards `/api` to the backend.

## Frontend environment

Copy `.env.example` to `.env` only when needed:

```env
VITE_API_BASE_URL=
VITE_API_TIMEOUT_MS=15000
VITE_ENABLE_API_LOGS=false
```

For a deployed frontend, `VITE_API_BASE_URL` must be the trusted HTTPS backend origin. Do not append `/api`.

## Backend prerequisites

The backend now requires environment variables for database, JWT, Cloudinary, and payment-bank configuration. Read the backend files:

- `.env.example`
- `SECURITY_AND_MIGRATION_README.md`
- `DATABASE_MIGRATION_SECURITY_PERFORMANCE.sql`

Rotate any old database, Cloudinary, and JWT credentials before running or publishing the source.

## Build verification

```powershell
npm ci
npm run build
```

`dist/` and `node_modules/` are intentionally excluded from Git.
