# Forke Status

Public status page for Forke at https://status.forke.space.

- `monitor/` checks every public Forke service about every 5 minutes (GitHub Actions, `.github/workflows/monitor.yml`) and stores the results on the `data` branch as `status.json`.
- `site/` is the page, published to GitHub Pages by `.github/workflows/pages.yml`. It reads `status.json` from the `data` branch and live delivery numbers from `https://mail.forke.space/api/public/status`.
- Services and URLs live in `monitor/targets.json`. The admin panel is monitored privately inside admin.forke.space, not here.

Every `/status` path on Forke's domains redirects here, with a `#tab` for the matching service.
