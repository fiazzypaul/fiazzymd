const fs = require('fs');
const path = require('path');
let fetchFn = global.fetch;
try { if (!fetchFn) { fetchFn = (...args) => import('node-fetch').then(({ default: f }) => f(...args)); } } catch {}
let sharp = null;
try { sharp = require('sharp'); } catch {}
const { createStickerBuffer } = require('./sticker');

function parseEmojisFromArgs(rawText, args) {
  if (args.length >= 2) return [args[0], args[1]];
  const one = args[0] || '';
  if (one.includes('+')) {
    const parts = one.split('+').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return [parts[0], parts[1]];
  }
  const tail = rawText.split(' ').slice(1).filter(Boolean);
  if (tail.length >= 2) return [tail[0], tail[1]];
  return [null, null];
}

async function mixEmojisToSticker(sock, msg, emoji1, emoji2) {
  const chatId = msg.key.remoteJid;
  const url = `https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`;
  const response = await fetchFn(url);
  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    await sock.sendMessage(chatId, { text: '❌ These emojis cannot be mixed! Try different ones.' });
    return;
  }
  const imageUrl = data.results[0].url;
  const imageResponse = await fetchFn(imageUrl);
  let imageBuffer = null;
  if (imageResponse.arrayBuffer) {
    const ab = await imageResponse.arrayBuffer();
    imageBuffer = Buffer.from(ab);
  } else if (imageResponse.buffer) {
    imageBuffer = await imageResponse.buffer();
  }
  const stickerBuffer = await createStickerBuffer(imageBuffer, 'Fiazzy-Md', 'fiazzy');
  await sock.sendMessage(chatId, { sticker: stickerBuffer }, { quoted: msg });
}

function usage(prefix) {
  return `🎴 *EMOJIMIX*\n\n*Usage:* ${prefix}emojimix <emoji1>+<emoji2>\nOr: ${prefix}emojimix <emoji1> <emoji2>\n\n*Examples:*\n${prefix}emojimix 😎+🥰\n${prefix}emojimix 😎 🥰`;
}

function registerEmojimixCommand({ registerCommand }) {
  const prefix = process.env.PREFIX || '.';
  const handler = async (sock, msg, args) => {
    try {
      const raw = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
      const [e1, e2] = parseEmojisFromArgs(raw, args);
      if (!e1 || !e2) {
        await sock.sendMessage(msg.key.remoteJid, { text: usage(prefix) });
        return;
      }
      await mixEmojisToSticker(sock, msg, e1, e2);
    } catch (error) {
      await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to mix emojis. ${usage(prefix)}` });
    }
  };
  registerCommand('emojimix', 'Mix two emojis into sticker', handler);
  registerCommand('emojixmix', 'Alias for emojimix', handler);
}

registerEmojimixCommand.sessions = new Map();
registerEmojimixCommand.composeBuffers = async (buf1, buf2) => {
  if (!sharp) return buf1;
  const a = await sharp(buf1).resize(512, 512, { fit: 'inside' }).png().toBuffer();
  const b = await sharp(buf2).resize(512, 512, { fit: 'inside' }).png().toBuffer();
  return await sharp(a).composite([{ input: b, gravity: 'center', blend: 'over' }]).png().toBuffer();
};

module.exports = registerEmojimixCommand;