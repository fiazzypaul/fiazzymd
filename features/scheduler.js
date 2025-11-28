const fs = require('fs')
const path = require('path')

const dbDir = path.join(__dirname, '..', 'database')
const file = path.join(dbDir, 'schedules.json')

try { if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true }) } catch {}
try { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ items: [] }), 'utf8') } catch {}

function load() {
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || '{"items":[]}') } catch { return { items: [] } }
}

function save(db) { try { fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8') } catch {} }

function listSchedules() { const db = load(); return db.items || [] }

function addSchedule(entry) {
  const db = load()
  db.items = db.items || []
  db.items.push(entry)
  save(db)
  return entry
}

function removeSchedule(id) {
  const db = load()
  db.items = (db.items || []).filter(x => x.id !== id)
  save(db)
}

let schedulerInterval = null
function startScheduler(sock) {
  if (schedulerInterval) { try { clearInterval(schedulerInterval) } catch {} }
  schedulerInterval = setInterval(async () => {
    const db = load()
    const now = Date.now()
    const remaining = []
    for (const item of db.items || []) {
      if (item.timestamp && now >= item.timestamp) {
        try {
          await sock.sendMessage(item.jid, { text: item.text })
        } catch {}
      } else {
        remaining.push(item)
      }
    }
    db.items = remaining
    save(db)
  }, 30000)
}

module.exports = { listSchedules, addSchedule, removeSchedule, startScheduler }