# SWT301 Full-stack Stability Audit

Date: 2026-07-16

This audit consolidates the latest frontend and backend fixes into one project and checks the earlier fixes from this conversation for regression.

## Overall result

| Area | Result |
|---|---|
| Frontend dependency install | Passed |
| Frontend automated tests | 12 passed, 0 failed |
| Frontend production build | Passed |
| npm security audit | 0 vulnerabilities |
| Backend production compilation | Passed, 102 Java source files |
| Backend automated tests | 125 passed, 0 failed, 0 errors |
| Backend executable JAR packaging | Passed |
| Backend test compilation | Passed, 25 test source files |
| Backend JaCoCo line coverage | 92.94% |
| Exact user QR integrity | Passed; byte-for-byte match |
| `application.yml` parsing | Passed |
| Live external database/Cloudinary mutation test | Not performed to protect real data |

## Latest requested corrections

### Login by phone

**Verified.** The invalid dynamic regular expression has been removed. Frontend now uses a valid escaped pattern:

```text
^(?:0[35789][0-9]{8}|\+84[35789][0-9]{8})$
```

The same rule is enforced for Login, Register, Profile, Addresses and manual Checkout address inputs.

Accepted examples:

```text
0912345678
+84912345678
```

Letters, invalid prefixes, missing digits and additional digits are rejected. Automated frontend and backend phone tests passed.

### Phone-length limitation

**Verified.** Local format is exactly 10 digits. International format must use `+84` instead of the leading zero and contains exactly nine digits after `+84`.

### Application configuration

**Verified as explicitly requested.** `application.yml` contains the server, JWT, payment, Cloudinary, datasource, Hikari, JPA and multipart structure supplied by the user. The two generated-VietQR settings were replaced by:

```yaml
qr-image-resource: classpath:/static/payment/vietqr-payment.png
```

This keeps the exact supplied QR as a local backend resource and prevents the project from returning to a generated or placeholder VietQR.

The file contains sensitive values because the user explicitly required them. It must not be committed to a public repository.

### Exact MB Bank QR

**Verified.** The backend-packaged image and the latest QR uploaded by the user have the same SHA-256 value:

```text
6fc61c7cf452b4f8b2633fb1676ec722c568ea4811a1f7a2d02b54adc5b3ad6f
```

The authenticated Customer/Admin QR endpoints return this exact local image. No request is made to `img.vietqr.io`, and no placeholder QR is generated. Checkout, My Orders and Admin Orders load the image through the backend.

Because the supplied `application.yml` bank labels do not describe the QR image itself, the frontend treats the QR image as the recipient source of truth and displays only the order amount and transfer note beside it.

### Products pagination/layout

**Verified.** Products requests use a fixed page size of 12. The responsive grid renders several products per page rather than one product per page. Search remains debounced and category filtering uses the independent category API.

### Addresses

**Verified by 10 backend tests and frontend build inspection.** The complete flow now supports:

- List addresses with the default address first
- Add address
- Edit owned address
- Delete unused address
- Prevent deleting an address referenced by an existing order
- Set an address as default
- Automatically make the first address default
- Ensure at least one default remains
- Promote another address after deleting or unchecking the current default
- Normalize and validate Vietnamese phone numbers
- Select a saved address during Checkout
- Use a manual immutable address snapshot during Checkout without creating a database Address first

## Regression audit of earlier fixes

### Authentication and session

**Verified by build/tests/static audit.** Login/Register show-hide password controls remain. Only valid roles are accepted. JWT uses the configured `ecommerce.app` properties with no fallback secret. Frontend stores the session in `sessionStorage`, validates JWT `exp` on startup, clears full user state on logout/401 and cancels active requests.

### Dashboard reliability

**Present and build-verified.** Products, Cart, Addresses and Orders retain separate request-success/error states. Failed requests are not silently converted into valid zero values. Admin Testing Readiness checks actual Admin Orders request success.

### API request lifecycle and privacy

**Present and build-verified.** Requests use `AbortController`, timeout handling and view-scope cancellation. API evidence logs are disabled in production unless enabled and redact credentials and personal/order data.

### Products and categories

**Verified by 10 backend Product tests plus frontend build.** Public products are ACTIVE-only. Cart/Checkout reject inactive products. Categories come from a dedicated endpoint. Admin Product forms require a backend category, validate image MIME/extension/size, preview selected images and support image replacement/removal. Product deletion is a soft deactivation.

### Cart and stock

**Verified by 8 Cart tests and 20 Order tests.** Add/stack/update cannot exceed stock. Checkout rechecks current stock, status and price. Stock is deducted during checkout and restored when an eligible order is cancelled. Frontend includes Clear Cart and confirmation before removal.

### Checkout, vouchers and payment methods

**Verified by Order/Voucher/controller tests plus frontend build.** COD and QR use backend-returned payment method IDs and visible radio controls. Empty cart is rejected. Voucher preview refreshes when the code changes. Manual addresses are order snapshots. Checkout includes idempotency protection. COD success UI remains available.

### Orders

**Verified by 20 Order tests.** New order codes use `ORD-` plus exactly six digits with collision retry. Order items, quantities, unit prices and subtotals are returned. Customer/Admin order lists are paginated. Saved delivery data is copied into immutable order snapshots.

### Order state and cancellation

**Verified.** The transition state machine remains enforced. Invalid transitions are rejected. Eligible cancellation restores stock and voucher usage. Payment verification is restricted to valid QR/payment/order states.

### Receipts and Cloudinary behavior

**Verified in isolated tests.** Ownership/workflow checks occur before receipt upload. Receipt replacement and Product image replacement invoke old-asset cleanup. Receipt access remains behind authenticated Customer/Admin endpoints rather than exposing a receipt URL in the order response.

The automated suite mocks Cloudinary, so the real account was not modified during this audit.

### HTTP error mapping and constraints

**Verified.** Exception tests cover 400, 401, 403, 404, 409, 413, 422, 500 and 502 mappings. Database migration files for unique email, phone, cart-item and checkout-idempotency constraints remain included.

### Admin behavior

**Present and tested.** Admin Orders keeps current-status selection, payment verification rules, protected receipt viewing and the exact configured QR. Revenue logic uses paid payments. Admin Products uses independent categories and English-facing category labels.

### Customer order history

**Present and tested.** My Orders includes order items, voucher information, receipt state, upload/verification timestamps and protected receipt viewing.

## Automated backend coverage

```text
Tests run: 125
Failures: 0
Errors: 0
Skipped: 0
BUILD SUCCESS
```

JaCoCo:

| Metric | Coverage |
|---|---:|
| Lines | 92.94% |
| Instructions | 88.74% |
| Methods | 82.46% |
| Classes | 92.45% |
| Branches | 67.41% |

## Important limitation

The audit compiled all production code, created the executable Spring Boot JAR and ran isolated automated tests, but deliberately did not perform destructive end-to-end operations against the configured real PostgreSQL database or Cloudinary account. Therefore, network availability, existing database data quality and external-service credentials still require a controlled live test using dedicated test data or a database backup.

## Recommended local verification

Backend:

```powershell
cd SWT301_BACKEND
.\mvnw.cmd clean test
.\mvnw.cmd spring-boot:run
```

Frontend:

```powershell
cd SWT301_FRONTEND
npm ci
npm run check
npm run dev
```
