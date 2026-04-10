# Click World News (Ping-First MVP)

Mobile-first interactive globe + Drudge-style signal feed.

## Core UX

- Full-bleed globe canvas
- Tap country to highlight + fetch local headlines
- Center **Ping** FAB for quick nearby headlines
- Bottom bar only: **Labels / Signal Feed / Location badge**
- Signal Feed in bottom sheet (pull-down close, pull-to-refresh)
- Search + Saved Pings in modal (secondary only)
- Graceful fallback banner: _"Feeds temporarily unavailable — showing last known headlines."_

## Data / Backend

- Node + Express backend proxy
- Google News RSS + fallbacks
- RSS cache TTL: **30 minutes**
- Nearby geocoding + search via OpenStreetMap Nominatim

## Local Run

```bash
cd projects/worldpulse-mvp
npm install
npm start
```

App runs at: `http://localhost:8093`

## Deploy (Railway)

Prereq: Railway account

```bash
cd projects/worldpulse-mvp
npx @railway/cli login
npx @railway/cli init
npx @railway/cli up
```

Then set custom domain in Railway dashboard.

## Deploy (Render)

- Connect repo in Render dashboard
- Use included `render.yaml`
- Service start command: `npm start`
- Health check path: `/api/signal`
