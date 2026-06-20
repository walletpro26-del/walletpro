# Wallet Pro (React)

This repo contains a React (Vite) frontend that interacts with a Google Apps Script backend (in the `appsscript/` folder).

Quick steps to deploy to Netlify:

1. Create a GitHub repository and push this project.
2. In Netlify, create a new site -> "Import from Git" and connect your GitHub repo.
3. Set the build command to `npm run build` and publish directory `dist` (these are defaulted by `netlify.toml`).
4. Add an environment variable in Netlify: `VITE_GAS_BASE_URL` -> your deployed Apps Script webapp URL (e.g. `https://script.google.com/macros/s/XXXXX/exec`).
5. Trigger a deploy; Netlify will build and publish automatically on each push.

Notes:
- The Apps Script server code is in `appsscript/` and exposes endpoints like `?action=verifyUser`.
- For automatic deployments you'll need to push to GitHub and connect Netlify via the Netlify UI or API (requires access token).
