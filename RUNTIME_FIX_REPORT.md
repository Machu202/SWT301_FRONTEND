# SWT301 Runtime Fix Report

## Symptoms fixed

- Customer Products page displayed `Unable to load this screen`.
- Dashboard Cart quantity displayed `Unavailable`.
- Checkout displayed `Unable to load this screen`.

## Root cause

`GET /api/carts` can create a cart for a customer who does not have one yet. The method was marked `@Transactional(readOnly = true)`, so the first cart read could attempt an INSERT inside a read-only transaction and return HTTP 500. Products also loaded the cart before rendering, while Checkout required the cart, so one Cart failure broke all three screens.

The Product entity also mapped `image_public_id`, a column not present in the original database schema. This could make Product and Cart queries fail on databases that had not applied the optional migration.

## Changes

### Backend

1. `CartServiceImpl.getCart()` now uses a normal writable transaction because it may create a missing cart.
2. `Product.imagePublicId` is transient. Product image cleanup derives the Cloudinary public ID from the existing image URL, so the database no longer requires `products.image_public_id`.
3. Product status response mapping is null-safe for legacy rows.
4. Added two runtime compatibility regression tests.

### Frontend

1. Products no longer disappear solely because Cart failed to load.
2. Add-to-cart is disabled with a visible Cart error until Refresh succeeds.
3. Products can fall back to the legacy `GET /api/products` endpoint when the paginated endpoint is unavailable.
4. Category failure is shown separately and does not hide products.
5. Checkout now identifies whether Cart, Addresses, or Payment Methods failed instead of showing one generic message.

## Preserved configuration

The following files are byte-for-byte unchanged from the prior Stable Verified package:

- `SWT301_BACKEND/.env`
- `SWT301_BACKEND/src/main/resources/application.yml`

No database, JWT, Cloudinary, QR, port, or other sensitive values were changed.

## Verification

- Backend JUnit tests: 127 passed, 0 failures, 0 errors.
- Frontend tests: 14 passed, 0 failures.
- Frontend production build: passed.
- `application.yml` and `.env`: SHA-256 unchanged.

A live Supabase end-to-end run could not be performed in the packaging environment because the Supabase hostname is not reachable from that environment. Run the supplied project against the configured backend and use Refresh once after replacing both folders.
