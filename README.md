# Habit Ledger

A weekly goal tracker (built with Claude): exercise 4×/week, Spanish daily,
3 core papers/day, weekday Discord paper sweep, writing 3×/week, and 2 books/month.
Weeks reset every Monday and past weeks are kept with their score. Data is saved
in the browser's localStorage (per device).

## Run it locally

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173).

## Publish to GitHub Pages

1. Create a GitHub repo (e.g. `habit-ledger`) and push this folder to `main`.
2. In the repo: **Settings → Pages → Source: "GitHub Actions"** (one-time step).
3. Every push to `main` now auto-deploys via `.github/workflows/deploy.yml`.
4. Your app will live at `https://<your-username>.github.io/habit-ledger/`.

## Install it like an app

- **Phone:** open the URL → browser menu → "Add to Home Screen".
- **Desktop:** open the URL in Chrome/Edge → click the install icon in the address bar.

## Ideas for Claude Code

- Add offline support with `vite-plugin-pwa` (so it opens with no connection).
- Export/import data as JSON (backup, or moving between devices).
- Streak counters per habit; a monthly summary view.
- Cross-device sync with Supabase (replace localStorage reads/writes).
- Edit habits in the UI instead of the `HABITS` constant in `src/App.jsx`.
