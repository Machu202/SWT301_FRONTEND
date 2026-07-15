# Frontend-to-Backend API Mapping

| Frontend workflow | Method | Backend endpoint | Role |
|---|---:|---|---|
| Login | POST | `/api/auth/login` | Public |
| Register | POST | `/api/auth/register` | Public |
| Read profile | GET | `/api/profile` | CUSTOMER / ADMIN |
| Update profile | PUT | `/api/profile` | CUSTOMER / ADMIN |
| Product catalog | GET | `/api/products` | Public |
| Product details | GET | `/api/products/{id}` | Public |
| Create product | POST multipart | `/api/admin/products` | ADMIN |
| Update product | PUT multipart | `/api/admin/products/{id}` | ADMIN |
| Delete product | DELETE | `/api/admin/products/{id}` | ADMIN |
| Read cart | GET | `/api/carts` | CUSTOMER |
| Add cart item | POST | `/api/carts/items` | CUSTOMER |
| Replace cart quantity | PUT | `/api/carts/items` | CUSTOMER |
| Remove cart item | DELETE | `/api/carts/items/{cartItemId}` | CUSTOMER |
| Read addresses | GET | `/api/addresses` | CUSTOMER |
| Create address | POST | `/api/addresses` | CUSTOMER |
| Update address | PUT | `/api/addresses/{id}` | CUSTOMER |
| Delete address | DELETE | `/api/addresses/{id}` | CUSTOMER |
| Validate voucher | GET | `/api/vouchers/check` | CUSTOMER |
| Load supported payment methods | GET | `/api/reference/payment-methods` | CUSTOMER / ADMIN |
| Load valid order statuses | GET | `/api/reference/order-statuses` | ADMIN |
| Preview checkout | GET | `/api/orders/preview` | CUSTOMER |
| Create order | POST | `/api/orders/checkout` | CUSTOMER |
| Read QR payment information | GET | `/api/orders/{orderId}/payment/qr-info` | CUSTOMER |
| Read configured VietQR payment image | GET | `/api/orders/{orderId}/payment/qr-code` | CUSTOMER |
| Upload QR receipt | POST multipart | `/api/orders/{orderId}/payment/qr` | CUSTOMER |
| Customer order history | GET | `/api/orders` | CUSTOMER |
| All system orders | GET | `/api/admin/orders` | ADMIN |
| Change order status | PUT | `/api/admin/orders/{id}/status` | ADMIN |
| Verify payment | PUT | `/api/admin/orders/{id}/payment` | ADMIN |

All authenticated calls send `Authorization: Bearer <JWT>`.

The frontend does not store payment-method IDs or order-status IDs as constants. It loads them from the two reference-data endpoints. The API base URL is fixed at build time by `VITE_API_BASE_URL` and cannot be changed by a Customer through Settings.


The QR image endpoint preserves Customer ownership and QR-payment validation before returning the bundled MB VietQR image. The frontend also bundles the same image so Checkout, receipt upload, My Orders, and Admin Orders use one consistent payment QR.
