# Payment Receipt Upload UI Fix

This patch changes only the frontend receipt-upload modal.

## Improvements

- Balanced two-panel layout for payment QR details and receipt upload.
- Custom click/drag-and-drop image picker.
- Local receipt preview before upload.
- File name, MIME type, and size display.
- Remove-image control.
- Inline validation for real JPG/PNG files up to 5 MB.
- Upload button remains disabled until a valid file is selected.
- Responsive layout for tablets and phones.
- Object URLs are revoked when preview images are replaced or the modal closes.

## Unchanged

- Backend source and configuration.
- QR image and payment information.
- Receipt API endpoint and Cloudinary upload behavior.
- Authentication and authorization logic.
