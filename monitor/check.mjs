/**
 * @fileoverview Forke Platform
 * @copyright (c) 2026 Forke Inc. (https://www.forke.space/)
 *
 * Source-Available License (Non-Commercial / Fair Source).
 * This source code is open for inspection, learning, and personal development.
 * Commercial use, hosting, or resale as a paid service without an explicit
 * commercial license from Forke Inc. is strictly prohibited.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import tls from 'node:tls'

const DATA = process.argv[2] || 'data/status.json'
const CONFIG = JSON.parse(await readFile(new URL('./components.json', import.meta.url)))
const NOTES = JSON.parse(await readFile(new URL('./notes.json', import.meta.url)))
const UA = 'ForkeStatus/2.0 (+https://status.forke.space)'
const DAYS = 366
const SAMPLES = 288
const SLOW_MS = 4000
const RENAMED = { mail: 'mail_api' }
const RANK = { operational: 0, degraded: 1, down: 2 }

async function probe(url, expect) {
  const started = Date.now()
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(15000) })
    const ms = Date.now() - started
    const ok = expect.includes(res.status)
    return { status: !ok ? 'down' : ms > SLOW_MS ? 'degraded' : 'operational', ms, reason: ok ? '' : `HTTP ${res.status}` }
  } catch (err) {
    return { status: 'down', ms: Date.now() - started, reason: `No response (${err.cause?.code || err.name || 'error'})` }
  }
}

const RETRY_DELAYS = [10000, 20000]
const CONTROLS = ['https://www.google.com/generate_204', 'https://api.github.com/zen', 'https://www.cloudflare.com/cdn-cgi/trace']

async function probeHTTP(c) {
  let result = await probe(c.url, c.expect)
  for (const delay of RETRY_DELAYS) {
    if (result.status === 'operational') break
    await new Promise((r) => setTimeout(r, delay))
    result = await probe(c.url, c.expect)
  }
  return result
}

async function checkerOnline() {
  const results = await Promise.all(CONTROLS.map((url) => probe(url, [200, 204])))
  return results.some((r) => r.status !== 'down')
}

function probeTLS({ host, port }) {
  const started = Date.now()
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, timeout: 10000 }, () => {
      const ok = socket.authorized
      socket.end()
      resolve({ status: ok ? 'operational' : 'down', ms: Date.now() - started, reason: ok ? '' : 'Certificate not valid' })
    })
    socket.on('timeout', () => { socket.destroy(); resolve({ status: 'down', ms: Date.now() - started, reason: 'No response on port ' + port }) })
    socket.on('error', (err) => resolve({ status: 'down', ms: Date.now() - started, reason: `Connection failed (${err.code || 'error'})` }))
  })
}

async function metrics() {
  try {
    const res = await fetch(CONFIG.metrics, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

const LAG_REASON = {
  transactional: 'Emails waiting longer than usual to send',
  broadcasts: 'Broadcasts sending slower than usual',
  workflows: 'Workflow steps running late',
  webhooks: 'Webhook deliveries delayed',
  email_events: 'Delivery updates from inbox providers delayed',
}

async function check(c, mail, mailAPI) {
  if (c.url) return probeHTTP(c)
  if (!mail) return mailAPI.status === 'down' ? { status: 'down', reason: 'Forke Mail is not responding', inherited: true } : null
  const m = (mail.components || []).find((x) => x.id === c.id)
  if (!m || m.status === 'not_enabled') return { status: 'hidden' }
  if (c.tls) {
    const t = await probeTLS(c.tls)
    if (t.status !== 'operational') return t
  }
  return { status: m.status, reason: m.status === 'operational' ? '' : LAG_REASON[c.id] || 'Slower than usual' }
}

function migrate(data) {
  if (data.version === 2) return data
  const next = { version: 2, components: {}, incidents: [] }
  for (const [oldId, svc] of Object.entries(data.services || {})) {
    const id = RENAMED[oldId] || oldId
    const days = {}
    for (const [k, d] of Object.entries(svc.days || {})) days[k] = { checks: d.checks, operational: d.up, degraded: 0, down: d.checks - d.up, msTotal: d.msTotal || 0 }
    next.components[id] = { id, days, samples: (svc.samples || []).map((s) => ({ t: s.t, ms: s.ms, status: s.ok ? 'operational' : 'down' })) }
  }
  for (const i of data.incidents || []) {
    const component = RENAMED[i.service] || i.service
    next.incidents.push({ id: `${component}-${i.startedAt.replace(/[-:]/g, '').slice(0, 13)}`, component, impact: 'down', started_at: i.startedAt, resolved_at: i.resolvedAt || null, reason: i.reason })
  }
  return next
}

let data = {}
try { data = JSON.parse(await readFile(DATA, 'utf8')) } catch {}
data = migrate(data)
const signature = (d) => [d.status, ...d.incidents.filter((i) => !i.resolved_at).map((i) => i.id + i.impact)].join('|')
const before = signature(data)

const now = new Date()
const day = now.toISOString().slice(0, 10)
const mail = await metrics()
const all = CONFIG.groups.flatMap((g) => g.components.map((c) => ({ ...c, group: g.id })))
const results = {}
const http = all.filter((c) => c.url)
const probed = await Promise.all(http.map((c) => probeHTTP(c)))
http.forEach((c, i) => { results[c.id] = probed[i] })
if (http.every((c) => results[c.id].status === 'down') && !(await checkerOnline())) {
  console.log('This runner cannot reach the internet; nothing recorded.')
  process.exit(0)
}
for (const c of all) {
  if (!results[c.id]) results[c.id] = await check(c, mail, results.mail_api)
}

for (const c of all) {
  const r = results[c.id]
  const comp = data.components[c.id] ||= { id: c.id, days: {}, samples: [] }
  Object.assign(comp, { id: c.id, name: c.name, group: c.group, description: c.description })
  const openIncident = data.incidents.find((i) => i.component === c.id && !i.resolved_at)
  if (!r) { comp.status ||= 'unknown'; continue }
  if (r.status === 'hidden' || (r.inherited && comp.status === 'hidden')) {
    comp.status = 'hidden'
    if (openIncident) openIncident.resolved_at = now.toISOString()
    continue
  }
  const prev = comp.samples.at(-1)
  comp.samples.push({ t: now.toISOString(), status: r.status, ms: r.ms ?? null })
  comp.samples = comp.samples.slice(-SAMPLES)
  const d = comp.days[day] ||= { checks: 0, operational: 0, degraded: 0, down: 0, msTotal: 0 }
  d.checks += 1
  d[r.status] += 1
  if (r.ms != null && r.status !== 'down') d.msTotal += r.ms
  comp.days = Object.fromEntries(Object.entries(comp.days).sort().slice(-DAYS))
  comp.status = r.status
  comp.lastCheck = { t: now.toISOString(), ms: r.ms ?? null, reason: r.reason || '' }

  const open = openIncident
  const bad = r.status !== 'operational'
  const confirmed = prev && prev.status !== 'operational' && !r.inherited
  if (bad && !open && confirmed) {
    data.incidents.unshift({ id: `${c.id}-${now.toISOString().replace(/[-:]/g, '').slice(0, 13)}`, component: c.id, name: c.name, impact: r.status, started_at: now.toISOString(), resolved_at: null, reason: r.reason })
  }
  if (bad && open && RANK[r.status] > RANK[open.impact]) open.impact = r.status
  if (!bad && open) open.resolved_at = now.toISOString()
}

const names = Object.fromEntries(all.map((c) => [c.id, c.name]))
const cutoff = new Date(now - DAYS * 86400000).toISOString()
data.incidents = data.incidents
  .filter((i) => i.started_at >= cutoff)
  .map((i) => ({ ...i, name: names[i.component] || i.name || i.component, title: NOTES[i.id]?.title || '', note: NOTES[i.id]?.note || '' }))
  .slice(0, 500)
data.groups = CONFIG.groups.map((g) => ({ id: g.id, name: g.name, description: g.description, components: g.components.map((c) => c.id) }))
for (const id of Object.keys(data.components)) if (!names[id]) delete data.components[id]
if (mail) data.mail = { windows: mail.windows, queue: mail.queue, limits: mail.limits, infrastructure: mail.infrastructure, generated_at: mail.generated_at }
const visible = Object.values(data.components).filter((c) => RANK[c.status] != null)
data.status = visible.reduce((s, c) => (RANK[c.status] > RANK[s] ? c.status : s), 'operational')
data.updatedAt = now.toISOString()
await mkdir(DATA.split('/').slice(0, -1).join('/') || '.', { recursive: true })
await writeFile(DATA, JSON.stringify(data))
if (process.env.GITHUB_OUTPUT && signature(data) !== before) await writeFile(process.env.GITHUB_OUTPUT, 'changed=true\n', { flag: 'a' })
console.log(all.map((c) => `${c.id}: ${data.components[c.id].status}`).join('\n'))
