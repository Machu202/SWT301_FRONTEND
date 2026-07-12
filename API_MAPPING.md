# Frontend-to-Backend API Mapping

| Frontend workflow | Method | Backend endpoint | Role |
|---|---:|---|---|
| Login | POST | `/api/auth/login` | Public |
| Register | POST | `/api/auth/register` | Public |
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
| Validate voucher | GET | `/api/vouchers/check` | CUSTOMER |
| Preview checkout | GET | `/api/orders/preview` | CUSTOMER |
| Create order | POST | `/api/orders/checkout` | CUSTOMER |
| Upload QR receipt | POST multipart | `/api/orders/{orderId}/payment/qr` | CUSTOMER |
| Customer order history | GET | `/api/orders` | CUSTOMER |
| All system orders | GET | `/api/admin/orders` | ADMIN |
| Change order status | PUT | `/api/admin/orders/{id}/status` | ADMIN |
| Verify payment | PUT | `/api/admin/orders/{id}/payment` | ADMIN |

All authenticated calls send `Authorization: Bearer <JWT>`.
