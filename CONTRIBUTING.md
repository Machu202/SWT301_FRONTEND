# Contributing

## Local setup

1. Run the Spring Boot backend on `http://localhost:8080`.
2. Copy `.env.example` to `.env` only when a custom API base URL is needed.
3. Install and run the frontend:

```bash
npm ci
npm run dev
```

## Before opening a pull request

```bash
npm ci
npm run build
```

Use the built-in API evidence log and update `tests/MANUAL_TEST_CASES.csv` when a workflow or expected result changes. Do not commit credentials, `.env`, `node_modules`, or `dist`.

## Commit guidance

Use focused commits such as:

- `fix: handle expired voucher response`
- `feat: add admin order-status filter`
- `test: add QR receipt boundary cases`
- `docs: update backend setup`
