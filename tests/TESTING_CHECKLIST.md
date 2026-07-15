# Functional Testing Checklist

## Environment
- Spring Boot responds at `http://localhost:8080/api/products`.
- Frontend runs through Vite at `http://localhost:5173`.
- Database contains CUSTOMER and ADMIN roles.
- Database contains PENDING status and valid payment methods.
- Cloudinary is configured before testing image upload.

## Recommended execution order
1. Public product and registration validation.
2. Customer login and role authorization.
3. Address validation.
4. Cart quantity and stock boundaries.
5. Voucher equivalence partitions.
6. Shipping fee boundary at 500,000 VND.
7. COD checkout and order history.
8. QR checkout, file validation, and payment verification.
9. Admin product CRUD.
10. Admin order-state transitions.
11. Negative authorization tests between CUSTOMER and ADMIN.

## Evidence
- Capture visible result messages.
- Use Test Lab for request path, HTTP status, duration, and response body.
- Verify database changes after destructive tests.
- Reset seed data before rerunning cases that change stock, voucher quantity, or order state.
