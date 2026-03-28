# Manual Playlist Mirror

Use this folder for playlists you need to mirror manually.

## Current placeholder

- `playlists/mylist.m3u`
  Source URL: `https://garyshare.sharewithyou.dpdns.org/mylist.m3u`

## How to use it

1. Replace the contents of `playlists/mylist.m3u` with the actual playlist text.
2. Commit and push the change.
3. Redeploy on Vercel.
4. Load `/playlists/mylist.m3u` in the app instead of the blocked upstream URL.

This avoids the server-side playlist fetch for the M3U file itself. Individual
stream URLs inside the playlist can still fail later if those hosts also block
proxy requests.

