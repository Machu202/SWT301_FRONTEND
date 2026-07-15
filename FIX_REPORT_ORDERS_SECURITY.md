# SWT301 Checkout, Session, Orders, and Admin Fix Report

## Đã sửa

1. **Checkout báo chỉ hỗ trợ COD hoặc QR_CODE**
   - Frontend không còn dùng ID thanh toán cố định `1` và `2`.
   - Backend bổ sung `GET /api/reference/payment-methods` để trả ID thật của `COD` và `QR_CODE` trong database.
   - Checkout gửi đúng `paymentMethodId` do backend trả về.

2. **My Orders hiển thị hai chữ PENDING không rõ nghĩa**
   - Badge được ghi rõ `Order: PENDING` và `Payment: PENDING`.

3. **Logout còn giữ dữ liệu của tài khoản trước**
   - Xóa toàn bộ session, cart, addresses, profile, customer orders, admin orders, voucher đang nhập, checkout preview, payment methods, order statuses, API logs, search/filter và dừng payment polling.

4. **HTTP 401 chỉ xóa token nhưng còn state.session**
   - Khi API có token trả HTTP 401, frontend xóa toàn bộ state, đóng modal, dừng payment polling và chuyển ngay về Login.

5. **Không kiểm tra JWT khi mở lại trang**
   - Frontend đọc JWT payload và kiểm tra `exp` trước khi hiển thị Dashboard.
   - JWT thiếu `exp`, sai định dạng hoặc hết hạn bị xóa ngay.

6. **Customer có thể chỉnh API Base URL**
   - API URL chỉ lấy từ `VITE_API_BASE_URL` lúc build hoặc Vite proxy.
   - Settings không còn cho Customer nhập URL tùy ý.
   - Giá trị `apiBaseUrl` cũ trong localStorage không còn được dùng để gửi JWT.

7. **Payment method dùng ID cố định**
   - Dùng dữ liệu từ endpoint payment methods mới.

8. **Checkout payment dùng dropdown**
   - Thay bằng radio button COD và QR_CODE để cả hai lựa chọn luôn hiển thị rõ.

9. **Order status dùng ID cố định**
   - Backend bổ sung `GET /api/reference/order-statuses`.
   - Admin Orders sử dụng ID do backend trả về.

10. **Admin không xem được receipt**
    - `OrderResponse` bổ sung `receiptUrl`.
    - Admin Orders có nút **View Receipt** và preview ảnh trước khi xác minh.
    - Nút Verify payment bị khóa khi chưa có receipt.

11. **Dropdown status không chọn trạng thái hiện tại**
    - Option trùng với `order.status` được đánh dấu `selected`.

12. **Voucher thay đổi nhưng preview cũ vẫn còn**
    - Bất kỳ thay đổi nào trong voucher sẽ xóa preview cũ và vô hiệu hóa Place Order.
    - Người dùng phải Preview lại voucher hiện tại.
    - Thay đổi cart cũng làm mất hiệu lực checkout preview cũ.

13. **Admin Dashboard tính toàn bộ đơn thành doanh thu**
    - Chỉ tính đơn có `paymentStatus = PAID` hoặc `status = DELIVERED`.

14. **Customer Dashboard Cart Items chỉ đếm loại sản phẩm**
    - Metric mới cộng tổng `quantity`.
    - Phần Current cart vẫn ghi rõ số distinct products.

15. **My Orders thiếu voucher và receipt**
    - `OrderResponse` bổ sung `voucherCode` và `receiptUrl`.
    - Customer xem được voucher, trạng thái receipt và ảnh receipt đã tải.

16. **Remove cart không xác nhận**
    - Thêm hộp thoại xác nhận trước khi xóa sản phẩm.

## Backend files changed

- `controller/ReferenceDataController.java` — mới
- `dto/response/PaymentMethodResponse.java` — mới
- `dto/response/OrderStatusResponse.java` — mới
- `dto/response/OrderResponse.java`
- `service/impl/OrderServiceImpl.java`

## Backend values preserved

Không thay đổi:

- `src/main/resources/application.yml`
- Database URL, username, password
- JWT secret và expiration
- Cloudinary credentials
- Server port
- Hikari configuration
- Entity/table/column mappings
- Các endpoint cũ

SHA-256 `application.yml` trước và sau:

`bc1d70ea4805c29b449fab0ef19ac9179b182128ea2d122aa99d663fb4f1aa02`

## Verification

- `node --check src/app.js`: PASS
- `node --check src/api.js`: PASS
- `npm ci`: PASS, 0 vulnerabilities
- `npm run build`: PASS
- Java source syntax scan: không phát hiện lỗi cú pháp; dependency compile đầy đủ chưa chạy vì Maven wrapper không tải được Maven trong môi trường đóng gói.
