import { renderBanner, renderSystems, renderMail, renderIncidents, renderHistory, MAIL } from './render.mjs'

const params = new URLSearchParams(location.search)
const DATA_URL = params.get('data') || 'https://raw.githubusercontent.com/forke-org/forke-status/data/status.json'
const LIVE = `${MAIL}/api/public/status`
const LIVE_IDS = ['transactional', 'broadcasts', 'workflows', 'webhooks', 'email_events', 'smtp']
const page = document.body.dataset.page
const $ = (s) => document.querySelector(s)
let data = window.__STATUS__ || null
let live = null
let offset = 0
let win = '7d'

function merge() {
  if (!data || !live?.components) return data
  const next = { ...data, components: { ...data.components } }
  for (const c of live.components) {
    const cur = next.components[c.id]
    if (!cur || !LIVE_IDS.includes(c.id) || cur.status === 'hidden') continue
    if (c.status === 'not_enabled') continue
    next.components[c.id] = { ...cur, status: c.status }
  }
  return next
}

function ago(iso) {
  const s = Math.round((Date.now() - new Date(iso)) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

function render() {
  const d = merge()
  if (!d) return
  if (page === 'history') { $('#history').innerHTML = renderHistory(d); return }
  const open = new Set([...document.querySelectorAll('details.group[open]')].map((el) => el.dataset.group))
  const closed = new Set([...document.querySelectorAll('details.group:not([open])')].map((el) => el.dataset.group))
  $('#banner').innerHTML = renderBanner(d)
  $('#systems-slot').innerHTML = renderSystems(d, offset)
  document.querySelectorAll('details.group').forEach((el) => {
    if (open.has(el.dataset.group)) el.open = true
    if (closed.has(el.dataset.group)) el.open = false
  })
  $('#mail-slot').innerHTML = renderMail(live || d.mail, win)
  $('#incidents-slot').innerHTML = renderIncidents(d)
  if (d.updatedAt) $('#updated').textContent = `Checked ${ago(d.updatedAt)}${live ? ' · email live' : ''}`
}

async function load() {
  const [a, b] = await Promise.allSettled([
    fetch(`${DATA_URL}${DATA_URL.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
    page === 'history' ? null : fetch(LIVE, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
  ])
  if (a.value?.version === 2) data = a.value
  if (b.value) live = b.value
  render()
}

document.addEventListener('click', (e) => {
  const shift = e.target.closest('[data-shift]')
  if (shift && !shift.disabled) { offset = Math.max(0, Math.min(11, offset + Number(shift.dataset.shift))); render() }
  const w = e.target.closest('[data-window]')
  if (w) { win = w.dataset.window; render() }
  if (e.target.closest('.info')) e.preventDefault()
  if (e.target.closest('[data-open-subscribe]')) { e.preventDefault(); $('#subscribe').showModal(); $('#subscribe input').focus() }
  if (e.target.closest('[data-close]')) $('#subscribe').close()
})

const tip = document.createElement('div')
tip.className = 'tip'
tip.hidden = true
document.body.append(tip)
function showTip(el) {
  tip.textContent = el.dataset.tip
  tip.hidden = false
  const r = el.getBoundingClientRect()
  const t = tip.getBoundingClientRect()
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8)
  const top = r.top - t.height - 8 < 8 ? r.bottom + 8 : r.top - t.height - 8
  tip.style.transform = `translate(${left}px, ${top + scrollY}px)`
}
document.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el) })
document.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) tip.hidden = true })
document.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el) })
document.addEventListener('focusout', () => { tip.hidden = true })

const form = $('#subscribe form')
form?.addEventListener('submit', async (e) => {
  e.preventDefault()
  const msg = $('#subscribe .msg')
  const btn = form.querySelector('button[type=submit]')
  btn.disabled = true
  try {
    const res = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) })
    msg.textContent = res.ok ? 'Check your inbox and click the link to confirm.' : res.status === 422 ? 'That email address does not look right.' : 'Could not subscribe right now. Try again in a minute.'
    msg.className = `msg ${res.ok ? 'ok' : 'bad'}`
  } catch {
    msg.textContent = 'Could not reach Forke Mail. Try again in a minute.'
    msg.className = 'msg bad'
  }
  btn.disabled = false
})

const notice = { confirmed: 'You are subscribed. We will email you when something breaks and when it is fixed.', removed: 'You will not get status emails any more.', expired: 'That link has expired. Subscribe again to get a new one.' }[params.get('subscribe')]
if (notice) {
  const el = $('#notice')
  el.textContent = notice
  el.hidden = false
  history.replaceState(null, '', location.pathname + location.hash)
}

render()
load()
setInterval(load, 60000)
