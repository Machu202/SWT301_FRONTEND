# SWT301 Checkout and Order Rules Fix

## Frontend
1. Login has an independent Show/Hide password button.
2. COD checkout displays a clear Order placed successfully modal.
3. Empty checkout displays: `Checkout require at least one cart item`.
4. COD and QR remain visible as radio options using IDs returned by the backend.
5. Price preview runs automatically on initial checkout load and after voucher edits; the manual Preview button is removed.
6. Place Order is enabled only when the latest automatic preview matches the current voucher.
7. Admin Orders displays only backend-approved next order statuses.
8. Payment verification is enabled only for QR orders in PENDING / PENDING_VERIFICATION with a receipt.

## Backend
1. Receipt order ownership and upload state are checked before Cloudinary upload.
2. Order transition state machine:
   - PENDING -> PROCESSING or CANCELLED
   - PROCESSING -> SHIPPED or CANCELLED
   - SHIPPED -> DELIVERED
   - DELIVERED and CANCELLED are terminal
3. QR orders must be PAID before PROCESSING.
4. Cancelling an unpaid order restores product stock and one voucher use within the same transaction.
5. Paid orders cannot be cancelled without a refund workflow.
6. COD payment becomes PAID when the order becomes DELIVERED.
7. Admin verification accepts only PAID or FAILED, and only from PENDING_VERIFICATION.
8. Expected errors now map to 400, 401, 403, 404, 409, 413, 422, or 502. Unexpected errors return 500.
9. Unique constraints were added for users.email, users.phone, and cart_items(cart_id, product_id).
10. Common QR/COD database naming aliases are canonicalized without hardcoding IDs.

## Configuration safety
`src/main/resources/application.yml` was not edited.
