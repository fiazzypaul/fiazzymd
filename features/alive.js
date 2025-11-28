const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'database');
const file = path.join(dbDir, 'alive.json');

try { if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true }); } catch {}
try { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}), 'utf8'); } catch {}

function loadDB() {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function saveDB(db) { try { fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8'); } catch {} }

const DEFAULT_ALIVE = '✨ Hey! I\'m Fiazzy-MD WhatsApp bot — alive and active for personal use. 🚀';

function setAliveMessage(_jidIgnored, message) {
  const db = loadDB();
  db.message = String(message || '').trim();
  saveDB(db);
}

function clearAliveMessage(_jidIgnored) {
  const db = loadDB();
  delete db.message;
  saveDB(db);
}

function getAliveMessage(_jidIgnored) {
  const db = loadDB();
  const msg = (db && db.message) ? db.message : DEFAULT_ALIVE;
  return msg;
}

module.exports = { setAliveMessage, clearAliveMessage, getAliveMessage, DEFAULT_ALIVE };