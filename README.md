# PokerNight

PokerNight is a production-ready MVP web app / PWA for tracking a private poker game among friends. It runs as a Vite + React + TypeScript app, uses Supabase for live shared state, and installs from the browser with "Add to Home Screen" on iPhone or Android.

## What You Get

- React 18 + Vite + TypeScript strict mode
- Tailwind CSS mobile-first UI
- Supabase PostgreSQL schema with RLS, Realtime, and settlements storage
- Live rooms, players, rebuys, dinner expenses, closing flow, and final summary
- PWA manifest + service worker for installable usage and offline read-only viewing
- Sharing via room code, URL, QR code, and WhatsApp

## 1. Create a Supabase Project and Run `schema.sql`

1. Create a new project in [Supabase](https://supabase.com/).
2. Open the SQL Editor inside your project.
3. Copy the contents of [`schema.sql`](./schema.sql) and run it.
4. The script creates:
   - `rooms`
   - `players`
   - `rebuy_events`
   - `settlements`
   - `dinner_expenses`
5. It also enables Row Level Security and adds the realtime publication entries for the live tables.

## 2. Enable Realtime on the Required Tables

The SQL file already adds the tables to the `supabase_realtime` publication, but you should still verify them in the dashboard:

1. Go to `Database` > `Replication`.
2. Confirm that these tables are enabled:
   - `rooms`
   - `players`
   - `rebuy_events`
   - `dinner_expenses`
3. If any table is missing, enable it there before testing the app.

## 3. Set Up `.env`

1. Copy [`.env.example`](./.env.example) to `.env`.
2. Fill in:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

You can find both values in `Project Settings` > `API` in Supabase.

## 4. Install Dependencies and Run Locally

```bash
npm install
npm run dev
```

The app will start on the local Vite development URL, usually `http://localhost:5173`.

## 5. Deploy to GitHub Pages

PokerNight is now adapted to publish cleanly on GitHub Pages with hash-based routes, so room links and summaries still open correctly under a repo URL.

1. Push this folder to a GitHub repository.
2. In GitHub open `Settings` > `Secrets and variables` > `Actions`.
3. Create these repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Push to the `main` branch.
5. GitHub Actions will build the app and publish `dist/` automatically using `.github/workflows/deploy-pages.yml`.
6. In `Settings` > `Pages`, make sure the source is set to `GitHub Actions`.
7. After the workflow finishes, GitHub will give you a public URL similar to:
   - `https://your-user.github.io/your-repo/`

If you prefer, the same app can still be deployed on [Vercel](https://vercel.com/) or Netlify as a standard Vite project.

## 6. Share the Link with Friends

1. The host creates a game at `/create`.
2. PokerNight generates a 5-character room code.
3. Share one of these:
   - The room code
   - The direct join link
   - The QR code
   - The WhatsApp share button
4. Friends open the link, choose their player from the prepared list, and join from `/join`.

## 7. Install the PWA on iPhone

1. Open the deployed site in Safari.
2. Tap the `Share` button.
3. Tap `Add to Home Screen`.
4. Open PokerNight from the icon like a normal app.

## 8. Install the PWA on Android

1. Open the deployed site in Chrome.
2. Open the browser menu.
3. Tap `Add to Home Screen` or `Install App`.
4. Launch PokerNight from the new icon.

## Security and MVP Notes

- This MVP does **not** use email/password auth.
- Identity is stored locally in the browser via `localStorage` using `playerId` and `roomCode`.
- Room codes act like private invite codes, so do not share them publicly.
- Monetary values are informational only. No payment processing is included.
- Because the app is intentionally auth-free, host-only actions are enforced in the client UI rather than through user authentication claims.

## Project Structure

```text
src/
  components/
  hooks/
  lib/
  pages/
  types/
public/
  icons/
schema.sql
vite.config.ts
```
