const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'sudo.json');

function ensureFile() {
  try { const dir = path.dirname(file); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
  try { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([]), 'utf8'); } catch {}
}

function load() {
  ensureFile();
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || '[]'); } catch { return []; }
}

function save(list) { try { fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8'); } catch {} }

function normalizeNumber(n) { return String(n || '').replace(/[^0-9]/g, ''); }

function numberFromJid(jid) { return String(jid || '').split('@')[0].replace(/[^0-9]/g, ''); }

function addSudo(number) {
  const list = load();
  const num = normalizeNumber(number);
  if (!num) return false;
  if (!list.includes(num)) { list.push(num); save(list); }
  return true;
}

function removeSudo(number) {
  const list = load();
  const num = normalizeNumber(number);
  const next = list.filter(x => x !== num);
  save(next);
  return list.length !== next.length;
}

function listSudos() { return load(); }

function isSudoJid(jid) {
  const list = load();
  const num = numberFromJid(jid);
  return list.includes(num);
}

module.exports = { addSudo, removeSudo, listSudos, isSudoJid };