# Forke Status

Public status page for Forke at https://status.forke.space.

- `monitor/components.json` lists the groups and components. A component either has a `url` (checked over HTTPS from GitHub Actions) or `"source": "mail"` (health read from `https://mail.forke.space/api/public/status`, which measures queue and event lag inside Forke Mail). SMTP also gets a TLS check once Forke Mail reports it enabled.
- `monitor/check.mjs` runs every 5 minutes (`.github/workflows/monitor.yml`) and keeps `status.json` on the `data` branch: each component's state, 366 days of daily check counts and incidents. Incidents open on an outage or on two slow checks in a row and close on the next good check.
- `monitor/notes.json` adds a write-up to an incident: `{ "<incident id>": { "title": "...", "note": "..." } }`.
- `site/build.mjs` pre-renders `index.html`, `history/`, `status.json`, `llms.txt`, `robots.txt` and `sitemap.xml` from that data, so search engines and link previews see the current status. `.github/workflows/pages.yml` publishes it every 30 minutes and whenever the monitor sees the status change. In the browser, `site/app.mjs` refreshes from the data branch and the live Forke Mail endpoint every minute.
- Forke Mail emails subscribers (`Status subscribers` tag, double opt-in from the Subscribe button) when an incident opens and when it resolves.

Preview locally: `node site/build.mjs <status.json> .preview`, then open `.preview/index.html` through any static server, adding `?data=/status.json` to read the local file.

Every `/status` path on Forke's domains redirects here.
