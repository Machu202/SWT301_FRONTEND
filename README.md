# SWT301 E-commerce Testing Frontend

A backend-connected Vite frontend for the `SWT301_BACKEND-main` Spring Boot project. It is designed for manual, API-integration, authorization, boundary-value, and automated UI testing using real backend data.

## Main workflows

### Public and authentication

- Backend connection check
- Customer registration
- Customer and admin login
- JWT session persistence
- Role-based navigation and access checks

### Customer

- Browse and search products
- Add, update, and remove cart items
- Create and update delivery addresses
- Validate Vietnamese phone numbers
- Check vouchers and preview backend-calculated totals
- Checkout using COD or QR payment
- View order history
- Upload JPG or PNG QR payment receipts up to 5 MB

### Admin

- Create and update products using multipart form data
- Delete products
- View all system orders
- Update order status using configured database IDs
- Verify payment as `PAID`, `FAILED`, or `PENDING_VERIFICATION`

### Software-testing support

- Stable `data-testid` selectors on important controls
- Built-in API evidence log with HTTP status and response time
- Sensitive fields redacted from logs
- Public, authenticated, authorization, and response-contract smoke checks
- Manual test cases in `tests/MANUAL_TEST_CASES.csv`
- Test checklist in `tests/TESTING_CHECKLIST.md`
- PostgreSQL/Supabase seed data in `BACKEND_TEST_DATA.sql`
- Endpoint mapping in `API_MAPPING.md`

## Requirements

- Node.js 22
- npm
- The Spring Boot backend running on port `8080`
- Configured PostgreSQL/Supabase, JWT secret, and Cloudinary credentials in the backend

## Local setup

### 1. Start the backend

From the backend folder on Windows:

```powershell
.\mvnw.cmd spring-boot:run
```

The backend must be available at `http://localhost:8080`.

### 2. Add test data

After Hibernate creates the database tables, run `BACKEND_TEST_DATA.sql` in Supabase SQL Editor or PostgreSQL.

| Role | Username | Password |
|---|---|---|
| ADMIN | `admin` | `Admin@123` |
| CUSTOMER | `customer` | `Customer@123` |

The script also creates roles, categories, payment methods, order statuses, products, and voucher boundary data.

### 3. Run the frontend

```powershell
npm ci
npm run dev
```

Open `http://localhost:5173`.

The Vite development proxy forwards `/api` to `http://localhost:8080`. Do not open `index.html` directly and do not use Live Server.

## Environment configuration

Copy `.env.example` to `.env` only when the frontend must call a backend at another origin:

```powershell
Copy-Item .env.example .env
```

```env
VITE_API_BASE_URL=https://your-public-backend.example.com
```

Do not append `/api`; the application request paths already start with `/api`.

## Database ID mapping

The backend does not provide list endpoints for categories, payment methods, or order statuses. Open **Settings** in the frontend and enter the IDs used by the database.

The included seed script assumes:

- Category: `1`
- COD: `1`
- QR: `2`
- `PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, and `CANCELLED`: IDs `1` through `5`

The SQL script prints the actual IDs at the end.

## Build verification

```powershell
npm ci
npm run build
npm run preview
```

The production files are generated in `dist/`, which is intentionally excluded from Git because GitHub Actions rebuilds it from source.

## GitHub repository support

This project includes:

- `.gitignore` and `.gitattributes`
- GitHub Actions build verification
- Optional manual GitHub Pages deployment
- Dependabot configuration
- Bug-report issue template
- Pull-request template
- Contribution guide

Follow [GITHUB_PUBLISHING.md](GITHUB_PUBLISHING.md) to create and push the repository.

### GitHub Pages limitation

GitHub Pages hosts only static files. It cannot run the Spring Boot backend or use the local Vite proxy. For a functional Pages deployment, host the backend publicly over HTTPS, configure Spring Security CORS for the Pages domain, and set the repository variable `VITE_API_BASE_URL` before manually running the Pages workflow.

## Known backend issues exposed by testing

- No API exists to list categories, payment methods, or order statuses.
- Address endpoints return the `Address` entity with its nested `User`; a response DTO should replace it to avoid exposing fields such as `passwordHash`.
- Spring MVC CORS is configured, but the Spring Security filter chain must also enable CORS for cross-origin production hosting.
- Product creation and QR receipt upload require valid Cloudinary configuration.

## Project structure

```text
SWT301_FRONTEND/
├── .github/                 GitHub Actions and repository templates
├── src/                     Frontend source
├── tests/                   Manual testing assets
├── .env.example             Environment variable template
├── API_MAPPING.md           Frontend/backend endpoint mapping
├── BACKEND_TEST_DATA.sql    Repeatable testing seed data
├── CONTRIBUTING.md          Contribution workflow
├── GITHUB_PUBLISHING.md     Repository publication instructions
├── index.html               Vite entry page
├── package.json             npm scripts and dependencies
└── vite.config.js           Vite proxy and build configuration
```

## npm registry troubleshooting

This repository is configured to use the public npm registry through the project-level `.npmrc` file.
If a previous failed install left locked files on Windows, close Node/Vite terminals, remove `node_modules`, clear npm's proxy settings if necessary, and run `npm ci` again.

Vite 7 requires Node.js 20.19 or newer.
