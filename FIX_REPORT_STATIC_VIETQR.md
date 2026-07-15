# Static VietQR Integration Report

## Configured payment destination

- Bank: MB
- Account name: CAO LE ANH KHOA
- Account number: 0846511618
- Transfer note: the order code shown by the application

## Frontend integration

The supplied image is bundled as `src/assets/vietqr-payment.png` and is used in:

1. QR payment help on Checkout.
2. The QR payment modal after a QR order is created.
3. My Orders through the `Show payment QR` action.
4. The receipt-upload modal so the Customer can scan and upload in one place.
5. Admin Orders through the `View Payment QR` action.

Receipt images uploaded by Customers remain separate from the configured payment QR.

## Backend integration

The same image is bundled as:

`src/main/resources/static/payment/vietqr-payment.png`

`GET /api/orders/{orderId}/payment/qr-code` now returns this configured image only after the existing Customer ownership and QR-payment-method checks pass.

The order-specific QR information response still returns order code, amount, payment status, and a transfer-reference description.

## Preserved behavior

- Customer authentication and order ownership checks.
- COD workflow.
- QR receipt upload to Cloudinary.
- Payment state transitions and Admin verification rules.
- Stock, voucher, order status, profile, and address behavior.
- All values in `application.yml`.

## Verification

- `node --check src/app.js`: passed.
- `npm ci`: passed.
- `npm run build`: passed.
- Frontend and backend QR image SHA-256 match the supplied image.
- Maven compilation could not run in the packaging environment because Maven Wrapper could not download Maven from Maven Central.
