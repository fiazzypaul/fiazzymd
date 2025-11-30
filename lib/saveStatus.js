const pino = require('pino');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

async function saveStatus(sock, msg) {
  const chatId = msg.key.remoteJid;
  const m = msg.message || {};
  const ctx = m.extendedTextMessage?.contextInfo || null;
  const stanzaId = ctx?.stanzaId;
  const participant = ctx?.participant;
  if (!stanzaId) {
    await sock.sendMessage(chatId, { text: '❌ Reply to a status with .save' });
    return;
  }

  let statusMsg = ctx.quotedMessage || null;
  try {
    if (!statusMsg) {
      const loaded = await sock.loadMessage('status@broadcast', stanzaId);
      statusMsg = loaded && loaded.message ? loaded.message : null;
    }
  } catch {}

  if (!statusMsg) {
    await sock.sendMessage(chatId, { text: '❌ Status not found or expired.' });
    return;
  }

  let inner = statusMsg;
  if (inner.ephemeralMessage && inner.ephemeralMessage.message) {
    inner = inner.ephemeralMessage.message;
  }

  try {
    if (inner.imageMessage) {
      const buffer = await downloadMediaMessage({ message: statusMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      await sock.sendMessage(chatId, { image: buffer, caption: '📸 Here’s the saved status image!' });
      return;
    }
    if (inner.videoMessage) {
      const buffer = await downloadMediaMessage({ message: statusMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      await sock.sendMessage(chatId, { video: buffer, caption: '🎥 Here’s the saved status video!' });
      return;
    }
    if (inner.audioMessage) {
      const buffer = await downloadMediaMessage({ message: statusMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      await sock.sendMessage(chatId, { audio: buffer, mimetype: inner.audioMessage.mimetype || 'audio/mpeg', ptt: false, fileName: 'audio' });
      return;
    }
    if (inner.documentMessage) {
      const buffer = await downloadMediaMessage({ message: statusMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      await sock.sendMessage(chatId, { document: buffer, mimetype: inner.documentMessage.mimetype || 'application/octet-stream', fileName: inner.documentMessage.fileName || 'file' });
      return;
    }
    if (inner.extendedTextMessage || inner.conversation) {
      const text = inner.extendedTextMessage?.text || inner.conversation || '';
      await sock.sendMessage(chatId, { text: `📝 Saved Status Text:\n\n${text}` });
      return;
    }
    await sock.sendMessage(chatId, { text: '❌ Unsupported status type.' });
  } catch (e) {
    await sock.sendMessage(chatId, { text: '❌ Error saving status: ' + (e && e.message ? e.message : String(e)) });
  }
}

module.exports = saveStatus;