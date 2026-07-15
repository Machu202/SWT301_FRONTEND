# Functional Testing Checklist

## Environment
- Spring Boot responds at `http://localhost:8080/api/products`.
- Frontend runs through Vite at `http://localhost:5173`.
- Database contains CUSTOMER and ADMIN roles.
- Database contains `PENDING` plus the valid order statuses used by the workflow.
- Database contains payment methods named `COD` and `QR_CODE`; their numeric IDs may be any valid database values.
- Cloudinary is configured before testing product images and receipt upload.

## Recommended execution order
1. Public product and registration validation.
2. Customer login, malformed/expired JWT checks, HTTP 401 handling, and logout cleanup.
3. Address and Vietnamese phone validation.
4. Cart quantity, confirmation, and stock boundaries.
5. Dynamic payment-method and order-status reference endpoints.
6. Voucher preview invalidation and shipping-fee boundaries.
7. COD checkout and labeled order/payment states.
8. QR checkout, file validation, receipt review, and payment verification.
9. Customer order history voucher and receipt display.
10. Admin product CRUD, current-status selection, and order-state transitions.
11. Dashboard cart-quantity and recognized-revenue calculations.
12. Negative authorization tests between CUSTOMER and ADMIN.

## Evidence
- Capture visible validation, confirmation, and result messages.
- Use Test Lab for request path, HTTP status, duration, and response body.
- Verify the API log is empty immediately after logout or authenticated HTTP 401.
- Verify database changes after destructive tests.
- Reset seed data before rerunning cases that change stock, voucher quantity, payment status, or order state.
