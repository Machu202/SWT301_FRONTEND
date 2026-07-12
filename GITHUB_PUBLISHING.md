# Publishing this project to GitHub

## 1. Create an empty repository

Create a repository on GitHub without generating a README, `.gitignore`, or license. Suggested name: `SWT301_FRONTEND`.

## 2. Push this folder

Open PowerShell in the project folder and run:

```powershell
git init
git add .
git commit -m "Initial SWT301 testing frontend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/SWT301_FRONTEND.git
git push -u origin main
```

Replace `YOUR_USERNAME` with the GitHub account or organization name.

If `origin` already exists:

```powershell
git remote set-url origin https://github.com/YOUR_USERNAME/SWT301_FRONTEND.git
git push -u origin main
```

## 3. Verify continuous integration

Open the repository's **Actions** tab. The **Frontend CI** workflow should run `npm ci` and `npm run build` for pushes and pull requests.

## Optional: publish the frontend with GitHub Pages

GitHub Pages can host only the static frontend. The Spring Boot backend must already be publicly hosted with HTTPS and must allow CORS requests from the Pages URL.

1. Open repository **Settings → Secrets and variables → Actions → Variables**.
2. Add a repository variable named `VITE_API_BASE_URL`.
3. Set it to the public backend origin, for example `https://api.example.com`—not a URL ending in `/api`.
4. Open **Settings → Pages** and select **GitHub Actions** as the source.
5. Open **Actions → Deploy GitHub Pages → Run workflow**.

The deployment workflow intentionally fails when `VITE_API_BASE_URL` is missing or is not HTTPS, because a Pages-hosted frontend cannot use the local Vite proxy.
