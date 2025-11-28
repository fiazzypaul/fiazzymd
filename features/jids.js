const fs = require('fs')
const path = require('path')

const dbDir = path.join(__dirname, '..', 'database')
const file = path.join(dbDir, 'jids.json')

try { if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true }) } catch {}
try { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ map: {} }), 'utf8') } catch {}

function load() { try { return JSON.parse(fs.readFileSync(file, 'utf8') || '{"map":{}}') } catch { return { map: {} } } }
function save(db) { try { fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8') } catch {} }

function normalizeName(name) { return String(name || '').trim().toLowerCase() }

function saveJid(name, jid) {
  const n = normalizeName(name)
  if (!n || !jid) return false
  const db = load()
  db.map[n] = String(jid).trim()
  save(db)
  return true
}

function getJidByName(name) { const n = normalizeName(name); const db = load(); return db.map[n] || null }
function listJids() { const db = load(); return Object.entries(db.map || {}).map(([name, jid]) => ({ name, jid })) }
function deleteJid(name) { const n = normalizeName(name); const db = load(); if (db.map[n]) { delete db.map[n]; save(db); return true } return false }

function extractJidFromText(text) {
  const s = String(text || '')
  const m = s.match(/\b[0-9]+@(?:s\.whatsapp\.net|g\.us)\b/)
  return m ? m[0] : null
}

function resolveJid(input, fallbackJid) {
  const t = String(input || '').trim()
  if (!t) return fallbackJid || null
  if (t.includes('@s.whatsapp.net') || t.includes('@g.us')) return t
  const byName = getJidByName(t)
  return byName || fallbackJid || null
}

module.exports = { saveJid, getJidByName, listJids, deleteJid, resolveJid, extractJidFromText }