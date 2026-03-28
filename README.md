# Signal Deck

Signal Deck is a Vercel-ready IPTV player for `.m3u` playlists. It loads a remote playlist, parses channels into a searchable directory, and proxies HLS manifests and segments so channel switching stays inside one player.

## What it includes

- Remote playlist loading through `/api/playlist`
- Local file and raw-text playlist fallback
- Search and group filters for channel browsing
- HLS manifest and segment proxying through `/api/proxy`
- Support for common per-channel headers from `#EXTVLCOPT` and `#EXTHTTP`

## Project structure

- `index.html`: static frontend shell
- `styles.css`: UI styling
- `app.js`: playlist loading, filtering, and player control
- `api/playlist.js`: fetches and parses a remote M3U playlist
- `api/proxy.js`: proxies manifests, rewrites nested HLS URLs, and forwards media requests

## Deploy to Vercel

1. Create a new Vercel project from this repo.
2. Leave the framework preset as `Other`.
3. Deploy with the repo root as the project root.

Vercel will serve the static files automatically and expose the `api/` functions as serverless endpoints.

## Local usage

This repo does not need a frontend build step. For local development you can run `vercel dev` if you have the Vercel CLI installed.

## Important constraint

The provided playlist URL currently returns a Cloudflare block page to direct server-side fetches from this environment. If the same protection blocks Vercel, remote URL loading and proxied playback will fail until the upstream host allows your deployment to fetch the playlist and media.
