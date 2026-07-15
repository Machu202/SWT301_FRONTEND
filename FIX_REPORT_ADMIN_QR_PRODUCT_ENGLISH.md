# SWT301 Admin QR and Product English Fix

## Fixed issues

### 1. Admin Orders QR payment dropdown
- QR payment verification dropdown is now openable for non-final QR payments.
- The **Verify payment** button remains protected and is enabled only when:
  - order status is `PENDING`,
  - payment status is `PENDING_VERIFICATION`, and
  - a valid receipt URL exists.
- Final payment states (`PAID`, `FAILED`) keep the dropdown disabled.
- A clear message explains why verification is locked.

### 2. Products and category language
- Known Vietnamese category names are displayed in English without changing backend IDs or database values:
  - `Bàn Phím Cơ` → `Mechanical Keyboards`
  - `Điện thoại` → `Phones`
  - `Keycap Sets & Phụ Kiện` → `Keycap Sets & Accessories`
- Category filter values still use the original backend category name so filtering remains compatible.
- Create/Edit Product now shows a readable category dropdown instead of only a numeric Category ID when category data is available.
- The known mixed-language sample product `Bộ Keycap Genshin Impact Theme (Full Set)` is displayed as `Genshin Impact Keycap Set (Full Set)`.
- English category and product labels are included in product search.

## Safety
- No backend Java file was changed.
- `application.yml` was not changed.
- Database IDs, entity mappings, API contracts, JWT, Cloudinary, port, and datasource values remain unchanged.

## Verification
- `node --check src/app.js`: passed.
- `npm ci`: passed.
- `npm run build`: passed.
