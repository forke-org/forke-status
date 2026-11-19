import { readFile, writeFile, mkdir } from 'node:fs/promises'

const DATA = process.argv[2] || 'data/status.json'
const TARGETS = JSON.parse(await readFile(new URL('./targets.json', import.meta.url)))
const UA = 'ForkeStatus/1.0 (+https://status.forke.space)'
const SAMPLES = 288
const DAYS = 90
const SLOW_MS = 4000

async function probe(url, expect) {
  const started = Date.now()
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(15000) })
    const ms = Date.now() - started
    return { ok: expect.includes(res.status), code: res.status, ms }
  } catch (err) {
    return { ok: false, code: 0, ms: Date.now() - started, error: String(err.cause?.code || err.name || 'error') }
  }
}

async function metrics(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

let data = { services: {}, incidents: [] }
try { data = JSON.parse(await readFile(DATA, 'utf8')) } catch {}
data.services ||= {}
data.incidents ||= []

const now = new Date()
const day = now.toISOString().slice(0, 10)

for (const target of TARGETS) {
  let result = await probe(target.url, target.expect)
  if (!result.ok) {
    await new Promise((r) => setTimeout(r, 5000))
    result = await probe(target.url, target.expect)
  }
  const svc = data.services[target.id] ||= { samples: [], days: {} }
  Object.assign(svc, { id: target.id, name: target.name, description: target.description })
  svc.samples.push({ t: now.toISOString(), ok: result.ok, ms: result.ms, code: result.code })
  svc.samples = svc.samples.slice(-SAMPLES)
  const d = svc.days[day] ||= { checks: 0, up: 0, msTotal: 0 }
  d.checks += 1
  if (result.ok) { d.up += 1; d.msTotal += result.ms }
  svc.days = Object.fromEntries(Object.entries(svc.days).sort().slice(-DAYS))

  const open = data.incidents.find((i) => i.service === target.id && !i.resolvedAt)
  if (!result.ok && !open) {
    data.incidents.unshift({ service: target.id, startedAt: now.toISOString(), reason: result.code ? `HTTP ${result.code}` : `No response (${result.error})` })
  }
  if (result.ok && open) open.resolvedAt = now.toISOString()

  svc.status = !result.ok ? 'down' : result.ms > SLOW_MS ? 'degraded' : 'operational'
  if (target.metrics) {
    const m = await metrics(target.metrics)
    if (m) {
      svc.metrics = m
      const w = m.windows?.['7d']
      if (svc.status === 'operational' && w && w.sent >= 100 && ((w.bounce_rate ?? 0) > m.limits.max_bounce_rate / 2 || (w.complaint_rate ?? 0) > m.limits.max_complaint_rate / 2)) {
        svc.status = 'degraded'
      }
    }
  }
  svc.lastCheck = { t: now.toISOString(), ...result }
}

data.incidents = data.incidents.slice(0, 50)
data.updatedAt = now.toISOString()
await mkdir(DATA.split('/').slice(0, -1).join('/') || '.', { recursive: true })
await writeFile(DATA, JSON.stringify(data))
console.log(Object.values(data.services).map((s) => `${s.id}: ${s.status} ${s.lastCheck.ms}ms`).join('\n'))
