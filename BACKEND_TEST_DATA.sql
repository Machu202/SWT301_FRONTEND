-- SWT301 e-commerce test data for PostgreSQL / Supabase
-- Test credentials created by this script:
--   ADMIN:    admin / Admin@123
--   CUSTOMER: customer / Customer@123
-- Run after Hibernate has created the tables.

BEGIN;

INSERT INTO roles (role_name) VALUES ('CUSTOMER') ON CONFLICT (role_name) DO NOTHING;
INSERT INTO roles (role_name) VALUES ('ADMIN') ON CONFLICT (role_name) DO NOTHING;

INSERT INTO order_status (status_name) VALUES
  ('PENDING'), ('PROCESSING'), ('SHIPPED'), ('DELIVERED'), ('CANCELLED')
ON CONFLICT DO NOTHING;

INSERT INTO payment_methods (method_name) VALUES ('COD'), ('QR_CODE')
ON CONFLICT DO NOTHING;

INSERT INTO categories (category_name) VALUES
  ('Electronics'), ('Accessories'), ('Home & Living')
ON CONFLICT DO NOTHING;

INSERT INTO users (role_id, username, password_hash, full_name, email, phone, created_at)
SELECT r.role_id, 'admin', '$2y$10$xl6aLb4IKYAEIWONCsWmv.wi2aRFROaR0inBD/sdXVpGm1Nhawl7K', 'System Administrator', 'admin@swt301.local', '0900000001', NOW()
FROM roles r WHERE r.role_name = 'ADMIN'
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (role_id, username, password_hash, full_name, email, phone, created_at)
SELECT r.role_id, 'customer', '$2y$10$giGbJlYxZcJ14e6YRTnB.uTBUKVzopq.1wzOVuyQ51Xdu60kQ39Xm', 'Test Customer', 'customer@swt301.local', '0912345678', NOW()
FROM roles r WHERE r.role_name = 'CUSTOMER'
ON CONFLICT (username) DO NOTHING;

INSERT INTO products (category_id, product_name, description, price, stock, image, status)
SELECT c.category_id, 'Wireless Testing Mouse', 'Seed product for cart quantity, stock, and checkout tests.', 249000, 25, NULL, 'ACTIVE'
FROM categories c
WHERE c.category_name = 'Electronics'
  AND NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Wireless Testing Mouse');

INSERT INTO products (category_id, product_name, description, price, stock, image, status)
SELECT c.category_id, 'Boundary Value Keyboard', 'Seed product priced near the free-shipping threshold.', 499000, 10, NULL, 'ACTIVE'
FROM categories c
WHERE c.category_name = 'Electronics'
  AND NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Boundary Value Keyboard');

INSERT INTO products (category_id, product_name, description, price, stock, image, status)
SELECT c.category_id, 'Out of Stock Cable', 'Use this product to verify stock validation and disabled cart controls.', 99000, 0, NULL, 'ACTIVE'
FROM categories c
WHERE c.category_name = 'Accessories'
  AND NOT EXISTS (SELECT 1 FROM products WHERE product_name = 'Out of Stock Cable');

INSERT INTO vouchers (voucher_code, voucher_name, discount_type, discount_value, min_order, expired_date, quantity, status)
VALUES
  ('FIXED50', 'Fixed 50,000 VND', 'FIXED', 50000, 200000, NOW() + INTERVAL '1 year', 100, 'ACTIVE'),
  ('PERCENT10', 'Ten Percent Off', 'PERCENT', 10, 100000, NOW() + INTERVAL '1 year', 100, 'ACTIVE'),
  ('EXPIRED', 'Expired Voucher', 'FIXED', 10000, 0, NOW() - INTERVAL '1 day', 10, 'ACTIVE'),
  ('EMPTYQTY', 'No Quantity Voucher', 'FIXED', 10000, 0, NOW() + INTERVAL '1 year', 0, 'ACTIVE')
ON CONFLICT (voucher_code) DO NOTHING;

COMMIT;

-- Verify reference data. The frontend fetches these IDs dynamically and stores no default database IDs:
SELECT role_id, role_name FROM roles ORDER BY role_id;
SELECT category_id, category_name FROM categories ORDER BY category_id;
SELECT payment_method_id, method_name FROM payment_methods ORDER BY payment_method_id;
SELECT status_id, status_name FROM order_status ORDER BY status_id;
