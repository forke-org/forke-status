# Forke Status

Public status page for Forke at https://status.forke.space.

- `monitor/components.json` lists the groups and components. A component either has a `url` (checked over HTTPS from GitHub Actions) or `"source": "mail"` (health read from `https://mail.forke.space/api/public/status`, which measures queue and event lag inside Forke Mail). SMTP also gets a TLS check once Forke Mail reports it enabled.
- `monitor/check.mjs` runs every 5 minutes (`.github/workflows/monitor.yml`) and keeps `status.json` on the `data` branch: each component's state, 366 days of daily check counts and incidents. Each target gets three tries over 30 seconds; if every target fails and the runner cannot reach Google, GitHub or Cloudflare either, the run is discarded as a runner network problem. Incidents open after two bad runs in a row (about 10 minutes) and close on the next good one. Forke Mail sub-components inherit an API outage without opening their own incidents.
- `monitor/false-alarms.json` lists ISO time prefixes (such as `"2026-11-23T09:1"`) of runs that were false alarms. The monitor removes incidents that started then and the failed checks recorded then.
- `monitor/notes.json` adds a write-up to an incident: `{ "<incident id>": { "title": "...", "note": "..." } }`.
- `site/build.mjs` pre-renders `index.html`, `history/`, `status.json`, `llms.txt`, `robots.txt` and `sitemap.xml` from that data, so search engines and link previews see the current status. `.github/workflows/pages.yml` publishes it every 30 minutes and whenever the monitor sees the status change. In the browser, `site/app.mjs` refreshes from the data branch and the live Forke Mail endpoint every minute.
- Forke Mail emails subscribers (`Status subscribers` tag, double opt-in from the Subscribe button) when an incident opens and when it resolves.

Preview locally: `node site/build.mjs <status.json> .preview`, then open `.preview/index.html` through any static server, adding `?data=/status.json` to read the local file.

GitHub throttles scheduled workflows, so `/etc/cron.d/forke-status-trigger` on the Forke server runs `/opt/forke/scripts/status-trigger.sh` every 5 minutes to dispatch `monitor.yml`. It does nothing until `/opt/forke/env/status-trigger.env` holds `GITHUB_TOKEN` (a fine-grained token for this repository with Actions read and write).

Every `/status` path on Forke's domains redirects here.
