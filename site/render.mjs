export const SITE = 'https://status.forke.space'
export const MAIL = 'https://mail.forke.space'
export const SUPPORT = 'support@forke.space'
const RANK = { operational: 0, degraded: 1, down: 2 }
const LABEL = { operational: 'Operational', degraded: 'Degraded', down: 'Outage', unknown: 'No data' }
const DAY = 86400000
const WINDOW = 90

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const pct = (v, digits = 2) => v == null ? '—' : `${(v * 100).toFixed(digits).replace(/\.?0+$/, '')}%`
const secs = (v) => v == null ? '—' : v < 60 ? `${v.toFixed(1)}s` : `${(v / 60).toFixed(1)}m`
const dayKey = (d) => d.toISOString().slice(0, 10)
const fmtDay = (key) => new Date(key + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const fmtMonth = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
export const fmtTime = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC'
const minutes = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000))
const duration = (m) => m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor(m % 1440 / 60)} h`

export function visibleGroups(data) {
  return (data.groups || []).map((g) => ({ ...g, items: g.components.map((id) => data.components?.[id]).filter((c) => c && c.status !== 'hidden') }))
    .filter((g) => g.items.length)
}

export function overall(data) {
  const all = visibleGroups(data).flatMap((g) => g.items)
  if (!all.length) return 'unknown'
  return all.reduce((s, c) => (RANK[c.status] > RANK[s] ? c.status : s), 'operational')
}

function worst(items) {
  return items.reduce((s, c) => (RANK[c.status] > RANK[s] ? c.status : s), 'operational')
}

export function windowEnd(offsetMonths, now = new Date()) {
  if (!offsetMonths) return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offsetMonths + 1, 0))
}

function days(end) {
  const out = []
  for (let i = WINDOW - 1; i >= 0; i--) out.push(dayKey(new Date(end - i * DAY)))
  return out
}

function tally(items, keys) {
  return keys.map((k) => {
    const t = { key: k, checks: 0, down: 0, degraded: 0 }
    for (const c of items) {
      const d = c.days?.[k]
      if (d) { t.checks += d.checks; t.down += d.down; t.degraded += d.degraded }
    }
    return t
  })
}

function uptime(rows) {
  let checks = 0, down = 0
  for (const r of rows) { checks += r.checks; down += r.down }
  return checks ? (checks - down) / checks : null
}

function dayClass(t) {
  if (!t.checks) return 'none'
  if (t.down / t.checks >= 0.05) return 'down'
  if (t.down || t.degraded) return 'degraded'
  return 'operational'
}

function bars(items, keys, incidents) {
  const rows = tally(items, keys)
  const ids = new Set(items.map((c) => c.id))
  const cells = rows.map((t) => {
    const cls = dayClass(t)
    const hits = incidents.filter((i) => ids.has(i.component) && i.started_at.slice(0, 10) <= t.key && (i.resolved_at || '9').slice(0, 10) >= t.key)
    const tip = [fmtDay(t.key), !t.checks ? 'No data' : cls === 'operational' ? 'No downtime' : `${pct((t.checks - t.down) / t.checks)} uptime`, ...hits.map((i) => i.title || `${i.name}: ${i.reason || LABEL[i.impact]}`)].join('\n')
    return `<i class="${cls}" data-tip="${esc(tip)}"></i>`
  })
  return { html: `<div class="bars">${cells.join('')}</div>`, uptime: uptime(rows) }
}

function info(text) {
  return `<span class="info" tabindex="0" role="note" aria-label="${esc(text)}" data-tip="${esc(text)}">i</span>`
}

export function renderBanner(data) {
  const st = overall(data)
  const open = (data.incidents || []).filter((i) => !i.resolved_at)
  const title = st === 'operational' ? "We're fully operational" : st === 'unknown' ? 'Status data is not available yet' : st === 'down' ? 'Some services are down' : "We're not at full strength"
  const sub = st === 'operational' ? "We're not aware of any issues affecting our systems."
    : st === 'unknown' ? 'The first checks have not finished yet.'
    : `${open.map((i) => i.name).join(', ') || 'Some services'} ${open.length === 1 ? 'is' : 'are'} affected. We're on it.`
  return `<div class="banner ${st === 'unknown' ? 'loading' : st}"><span class="dot"></span><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></div>`
}

export function renderSystems(data, offset = 0, now = new Date()) {
  const end = windowEnd(offset, now)
  const keys = days(end)
  const incidents = data.incidents || []
  const first = Object.values(data.components || {}).flatMap((c) => Object.keys(c.days || {})).sort()[0]
  const canPrev = offset < 11 && first && first < keys[0]
  const groups = visibleGroups(data).map((g) => {
    const st = worst(g.items)
    const gb = bars(g.items, keys, incidents)
    const rows = g.items.map((c) => {
      const b = bars([c], keys, incidents)
      return `<div class="comp"><div class="row"><span class="name"><span class="label">${esc(c.name)}</span>${info(c.description)}</span><span class="up">${pct(b.uptime)} uptime</span><span class="badge ${c.status}">${LABEL[c.status] || LABEL.unknown}</span></div>${b.html}</div>`
    }).join('')
    return `<details class="group" data-group="${esc(g.id)}"${st !== 'operational' ? ' open' : ''}>
      <summary><div class="row"><span class="name"><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span class="label">${esc(g.name)}</span>${info(g.description)}<small>${g.items.length} components</small></span><span class="up">${pct(gb.uptime)} uptime</span><span class="badge ${st}">${LABEL[st]}</span></div>${gb.html}</summary>
      <div class="comps">${rows}</div></details>`
  }).join('')
  return `<section class="card" id="systems"><div class="card-head"><div><h2>System status</h2><p>Daily uptime, checked from outside our servers</p></div>
    <div class="range"><button type="button" class="nav" data-shift="1" aria-label="Earlier months"${canPrev ? '' : ' disabled'}>‹</button><span>${fmtMonth(new Date(end - (WINDOW - 1) * DAY))} – ${fmtMonth(end)}</span><button type="button" class="nav" data-shift="-1" aria-label="Later months"${offset ? '' : ' disabled'}>›</button></div></div>
    ${groups || '<p class="empty">No checks yet.</p>'}
    <div class="legend"><span>${fmtDay(keys[0])}</span><span class="keys"><i class="operational"></i>Operational<i class="degraded"></i>Degraded<i class="down"></i>Outage<i class="none"></i>No data</span><span>${offset ? fmtDay(keys.at(-1)) : 'Today'}</span></div></section>`
}

export function renderMail(m, win = '7d') {
  if (!m?.windows) return ''
  const w = m.windows[win] || {}
  const lim = m.limits || {}
  const btn = (k, label) => `<button type="button" data-window="${k}" aria-pressed="${k === win}">${label}</button>`
  return `<section class="card" id="mail"><div class="card-head"><div><h2>Email delivery</h2><p>Every email sent through Forke Mail, across all accounts, through ${esc(m.infrastructure || 'Amazon SES')}</p></div>
    <div class="seg">${btn('24h', '24 hours')}${btn('7d', '7 days')}${btn('30d', '30 days')}</div></div>
    <div class="card-body"><div class="grid">
      <div class="stat"><span>Delivered ${info('Share of sent emails the recipient’s mail server accepted.')}</span><b>${pct(w.delivery_rate)}</b><small>${(w.delivered ?? 0).toLocaleString('en-US')} of ${(w.sent ?? 0).toLocaleString('en-US')} sent</small></div>
      <div class="stat"><span>Typical delivery ${info('Time from handing the email to Amazon SES until the recipient’s server accepts it.')}</span><b>${secs(w.delivery_seconds_p50)}</b><small>95% within ${secs(w.delivery_seconds_p95)}</small></div>
      <div class="stat"><span>Bounce rate ${info('Emails rejected because the address does not exist or cannot receive mail.')}</span><b>${pct(w.bounce_rate)}</b><small>Sending pauses at ${pct(lim.max_bounce_rate, 1)}</small></div>
      <div class="stat"><span>Spam complaints ${info('Recipients who pressed “report spam”.')}</span><b>${pct(w.complaint_rate, 3)}</b><small>Sending pauses at ${pct(lim.max_complaint_rate, 1)}</small></div>
    </div>
    <p class="note">Waiting to send right now: <b>${(m.queue?.transactional_queued ?? 0).toLocaleString('en-US')}</b> transactional and <b>${(m.queue?.broadcast_pending ?? 0).toLocaleString('en-US')}</b> broadcast emails.</p></div></section>`
}

function incidentItem(i) {
  const status = i.resolved_at ? `Resolved after ${duration(minutes(i.started_at, i.resolved_at))}` : 'Ongoing'
  return `<li class="${i.resolved_at ? '' : 'open'}"><div><b>${esc(i.title || `${i.name} ${i.impact === 'down' ? 'outage' : 'slowdown'}`)}</b><p>${esc(i.note || i.reason || '')}</p></div><small><span class="badge ${i.resolved_at ? 'operational' : i.impact}">${status}</span><time datetime="${esc(i.started_at)}">${fmtTime(i.started_at)}</time></small></li>`
}

export function renderIncidents(data) {
  const list = (data.incidents || []).slice(0, 5)
  return `<section class="card" id="incidents"><div class="card-head"><div><h2>Recent incidents</h2><p>Opened and closed automatically by our checks</p></div><a class="button" href="/history/">View history</a></div>
    ${list.length ? `<ul class="incidents">${list.map(incidentItem).join('')}</ul>` : '<p class="empty">No incidents in the last year.</p>'}</section>`
}

export function renderHistory(data, now = new Date()) {
  const out = []
  for (let m = 0; m < 12; m++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1))
    const key = start.toISOString().slice(0, 7)
    const list = (data.incidents || []).filter((i) => i.started_at.slice(0, 7) === key)
    out.push(`<section class="card month"><div class="card-head"><h2>${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><span class="count">${list.length ? `${list.length} incident${list.length > 1 ? 's' : ''}` : ''}</span></div>
      ${list.length ? `<ul class="incidents">${list.map(incidentItem).join('')}</ul>` : '<p class="empty">No incidents reported.</p>'}</section>`)
  }
  return out.join('')
}

export function summaryText(data) {
  const st = overall(data)
  const lines = visibleGroups(data).flatMap((g) => g.items.map((c) => `${c.name}: ${LABEL[c.status] || LABEL.unknown}`))
  return { status: st, lines }
}
