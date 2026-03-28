# Signal Deck

Signal Deck is a Vercel-ready IPTV player for `.m3u` playlists. It loads a remote playlist, parses channels into a searchable directory, and proxies HLS manifests and segments so channel switching stays inside one player.

## What it includes

- Remote playlist loading through `/api/playlist`
- Playlist-level `Referer`, `Origin`, and `User-Agent` overrides for sources that reject default proxy requests
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

## Troubleshooting 403 playlist errors

- Try setting the playlist `Referer`, `Origin`, or `User-Agent` in the UI before loading the URL.
- If diagnostics show HTML or a Cloudflare block page, the host is rejecting server-side requests from Vercel.
- In that case, the reliable fix is to mirror the `.m3u` file to a host you control and load that mirrored playlist instead.
- Uploading or pasting the playlist bypasses remote playlist fetching, but stream playback can still fail later if the channel hosts also block proxied requests.

## Manual mirror path

This repo includes a placeholder at `playlists/mylist.m3u` for the blocked source:

- `https://garyshare.sharewithyou.dpdns.org/mylist.m3u`

Replace that file with the real playlist contents, redeploy, then load:

- `/playlists/mylist.m3u`

## Private Vercel Blob mirror

If your Blob store is private, the app can still load a mirrored playlist through `/api/playlist` as long as your Vercel project has `BLOB_READ_WRITE_TOKEN` available in its environment.

Example private blob URL:

- `https://3gvchh5vsgxboe2c.private.blob.vercel-storage.com/mirrors/mylist.m3u`

Paste that URL into the app's `M3U URL` field after redeploying. The server will attach the bearer token automatically when reading private Vercel Blob URLs.
