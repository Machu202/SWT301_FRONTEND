# Frontend-to-Backend API Mapping

| Workflow | Method | Endpoint | Role |
|---|---:|---|---|
| Login | POST | `/api/auth/login` | Public |
| Register | POST | `/api/auth/register` | Public |
| Profile | GET / PUT | `/api/profile` | Customer/Admin |
| Product page | GET | `/api/products/page` | Public |
| Categories | GET | `/api/reference/categories` | Public |
| Admin product page | GET | `/api/admin/products` | Admin |
| Create/update product | POST / PUT multipart | `/api/admin/products`, `/api/admin/products/{id}` | Admin |
| Deactivate product | DELETE | `/api/admin/products/{id}` | Admin |
| Cart | GET | `/api/carts` | Customer |
| Add/update cart item | POST / PUT | `/api/carts/items` | Customer |
| Remove cart item | DELETE | `/api/carts/items/{cartItemId}` | Customer |
| Clear cart | DELETE | `/api/carts/items` | Customer |
| Addresses | GET / POST | `/api/addresses` | Customer |
| Address update/delete | PUT / DELETE | `/api/addresses/{id}` | Customer |
| Price preview | GET | `/api/orders/preview?voucherCode=` | Customer |
| Payment methods | GET | `/api/reference/payment-methods` | Customer/Admin |
| Checkout | POST + `Idempotency-Key` | `/api/orders/checkout` | Customer |
| Customer order page | GET | `/api/orders/page` | Customer |
| Dynamic QR information | GET | `/api/orders/{id}/payment/qr-info` | Order owner |
| Dynamic QR image | GET | `/api/orders/{id}/payment/qr-code` | Order owner |
| Upload receipt | POST multipart | `/api/orders/{id}/payment/qr` | Order owner |
| Protected customer receipt | GET | `/api/orders/{id}/payment/receipt` | Order owner |
| Admin order page | GET | `/api/admin/orders/page` | Admin |
| Admin paid-revenue metrics | GET | `/api/admin/orders/metrics` | Admin |
| Order statuses | GET | `/api/reference/order-statuses` | Admin |
| Admin QR information/image | GET | `/api/admin/orders/{id}/payment/qr-info`, `/qr-code` | Admin |
| Protected Admin receipt | GET | `/api/admin/orders/{id}/payment/receipt` | Admin |
| Change order status | PUT | `/api/admin/orders/{id}/status?statusId=` | Admin |
| Verify QR payment | PUT | `/api/admin/orders/{id}/payment?paymentStatus=` | Admin |

Authenticated calls send `Authorization: Bearer <JWT>`. Checkout also sends a unique `Idempotency-Key` so retrying a timed-out request does not create a duplicate order.
