/**
 * @fileoverview Forke Platform
 * @copyright (c) 2026 Forke Inc. (https://www.forke.space/)
 *
 * Source-Available License (Non-Commercial / Fair Source).
 * This source code is open for inspection, learning, and personal development.
 * Commercial use, hosting, or resale as a paid service without an explicit
 * commercial license from Forke Inc. is strictly prohibited.
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { renderBanner, renderSystems, renderMail, renderIncidents, renderHistory, summaryText, esc, SITE, MAIL, SUPPORT } from './render.mjs'

const [input = 'data/status.json', out = '_site'] = process.argv.slice(2)
const here = (f) => new URL(f, import.meta.url)
let data = { version: 2, groups: [], components: {}, incidents: [] }
try {
  const parsed = JSON.parse(await readFile(input, 'utf8'))
  if (parsed.version === 2) data = parsed
} catch {}
const now = new Date()
const updated = data.updatedAt || now.toISOString()
const summary = summaryText(data)
const statusWord = { operational: 'All systems operational', degraded: 'Some services are degraded', down: 'Some services are down', unknown: 'Checking services' }[summary.status]

function page({ path, title, description, body, pageId }) {
  const url = SITE + path
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url,
    description,
    dateModified: updated,
    isPartOf: { '@type': 'WebSite', name: 'Forke Status', url: SITE + '/' },
    about: { '@type': 'Organization', name: 'Forke', url: 'https://www.forke.space', logo: SITE + '/forke-mark.png', email: SUPPORT },
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Forke Status">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/og.png">
<meta name="theme-color" content="#151414">
<link rel="icon" href="/forke-mark.png" type="image/png">
<link rel="alternate" type="application/json" href="/status.json" title="Forke status data">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body data-page="${pageId}">
<div class="wrap">
  <header>
    <a class="brand" href="/"><img src="/forke-mark.png" alt="" width="28" height="28"><b>forke<span>*</span></b><em>status</em></a>
    <div class="actions">
      <a class="button" href="mailto:${SUPPORT}?subject=Problem%20with%20Forke">Report a problem</a>
      <a class="button primary" href="#subscribe" data-open-subscribe>Subscribe to updates</a>
    </div>
  </header>
  <div class="rule"></div>
  <p class="notice" id="notice" role="status" hidden></p>
${body}
  <div class="rule"></div>
  <footer>
    <span id="updated">Checked ${esc(new Date(updated).toISOString().slice(0, 16).replace('T', ' '))} UTC</span>
    <nav><a href="/history/">Incident history</a><a href="/status.json">status.json</a><a href="https://www.forke.space">forke.space</a><a href="${MAIL}">Forke Mail</a><a href="mailto:${SUPPORT}">${SUPPORT}</a></nav>
  </footer>
</div>
<dialog id="subscribe" aria-labelledby="subscribe-title">
  <form method="post" action="${MAIL}/api/public/status/subscribe">
    <button type="button" class="close" data-close aria-label="Close">×</button>
    <h2 id="subscribe-title">Get status updates</h2>
    <p>We email you when a Forke service has a problem and again when it is fixed. Nothing else.</p>
    <div class="field"><input type="email" name="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email address"><button class="button primary" type="submit">Subscribe</button></div>
    <p class="msg" aria-live="polite"></p>
  </form>
</dialog>
<script type="module" src="/app.mjs"></script>
</body>
</html>
`
}

const home = page({
  path: '/',
  pageId: 'home',
  title: 'Forke Status: live uptime for Forke and Forke Mail',
  description: `${statusWord}. Live status and 90-day uptime for forke.space, the Forke dashboard and API, and Forke Mail sending, SMTP, webhooks and email delivery.`,
  body: `  <div id="banner">${renderBanner(data)}</div>
  <main>
    <div id="systems-slot">${renderSystems(data, 0, now)}</div>
    <div id="mail-slot">${renderMail(data.mail)}</div>
    <div id="incidents-slot">${renderIncidents(data)}</div>
  </main>`,
})

const history = page({
  path: '/history/',
  pageId: 'history',
  title: 'Incident history · Forke Status',
  description: 'Every outage and slowdown on forke.space, the Forke dashboard, the Forke API and Forke Mail over the last 12 months, opened and closed automatically by our checks.',
  body: `  <main>
    <h1 class="page-title">Incident history</h1>
    <p class="page-sub">The last 12 months. Incidents open and close on their own when our checks see a problem start and end.</p>
    <div id="history">${renderHistory(data, now)}</div>
    <a class="back" href="/">← Back to current status</a>
  </main>`,
})

const llms = `# Forke Status

> Live status of Forke (forke.space, the Forke dashboard and API) and Forke Mail (sending API, broadcasts, workflows, SMTP, email events and webhooks). Checked from outside our servers.

Current status: ${statusWord} (as of ${updated}).

${summary.lines.map((l) => `- ${l}`).join('\n')}

## Pages

- [Current status](${SITE}/): banner, components with 90-day daily uptime, live email delivery numbers and recent incidents.
- [Incident history](${SITE}/history/): every incident in the last 12 months.

## Data

- [status.json](${SITE}/status.json): machine-readable status. \`status\` is the overall state (operational, degraded or down), \`components\` holds each component's state and daily check counts, \`incidents\` lists incidents with \`started_at\` and \`resolved_at\`.
- [Live Forke Mail metrics](${MAIL}/api/public/status): delivery rate, delivery time, bounce and complaint rates and component health, refreshed every minute.

## Contact

Report a problem: ${SUPPORT}
`

await mkdir(`${out}/history`, { recursive: true })
await writeFile(`${out}/index.html`, home)
await writeFile(`${out}/history/index.html`, history)
await writeFile(`${out}/status.json`, JSON.stringify(data))
await writeFile(`${out}/llms.txt`, llms)
await writeFile(`${out}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
await writeFile(`${out}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${updated.slice(0, 10)}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE}/history/</loc><lastmod>${updated.slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>
</urlset>
`)
await writeFile(`${out}/404.html`, page({ path: '/404.html', pageId: 'missing', title: 'Page not found · Forke Status', description: 'This page does not exist.', body: '  <main><h1 class="page-title">Page not found</h1><p class="page-sub">This page does not exist.</p><a class="back" href="/">← Current status</a></main>' }).replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex">'))
for (const f of ['style.css', 'app.mjs', 'render.mjs', 'forke-mark.png', 'og.png', 'CNAME']) await copyFile(here(f), `${out}/${f}`)
console.log(`built ${out}: ${summary.status}`)
