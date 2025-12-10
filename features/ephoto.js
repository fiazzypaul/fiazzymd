const axios = require('axios');
const cheerio = require('cheerio');
const sharp = require('sharp');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const LIGHT_URL = 'https://en.ephoto360.com/light-text-effect-futuristic-technology-style-648.html';
const NEON_AVATAR_URL = 'https://en.ephoto360.com/create-a-blue-neon-light-avatar-with-your-photo-777.html';

const styleSessions = new Map();

async function fetchLightStyles() {
  const res = await axios.get(LIGHT_URL, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
  const $ = cheerio.load(res.data);
  const styles = [];
  $('input[type="radio"]').each((_, el) => {
    const name = $(el).attr('name') || '';
    const value = $(el).attr('value') || '';
    let label = '';
    const parent = $(el).parent();
    if (parent && parent.text()) label = parent.text().trim();
    if (!label) {
      const sib = $(el).next();
      if (sib && sib.text()) label = sib.text().trim();
    }
    styles.push({ name, value, label: label || value });
  });
  return styles.length ? styles : null;
}

async function listLightStyles(sock, msg) {
  const chatId = msg.key.remoteJid;
  const styles = await fetchLightStyles();
  if (!styles) { await sock.sendMessage(chatId, { text: '❌ Could not load styles for light effect.' }); return; }
  const key = `${chatId}:${msg.key.participant || msg.key.remoteJid}`;
  styleSessions.set(key, { url: LIGHT_URL, styles });
  let text = '📜 Available Light Styles\n\n';
  styles.forEach((s, i) => { text += `${i + 1}. ${s.label}\n`; });
  text += '\nRun: .lightstyle <number> <text>'; 
  await sock.sendMessage(chatId, { text });
}

async function generateLightWithStyle(sock, msg, args) {
  const chatId = msg.key.remoteJid;
  if (args.length < 2) { await sock.sendMessage(chatId, { text: '❌ Usage: .lightstyle <style_number> <text>' }); return; }
  const index = parseInt(args[0]);
  const inputText = args.slice(1).join(' ');
  if (isNaN(index) || index < 1) { await sock.sendMessage(chatId, { text: '❌ Invalid style number.' }); return; }
  const key = `${chatId}:${msg.key.participant || msg.key.remoteJid}`;
  const sess = styleSessions.get(key);
  if (!sess || !sess.styles || index > sess.styles.length) { await sock.sendMessage(chatId, { text: '❌ No style session found. Run .lightstyles first.' }); return; }
  await sock.sendMessage(chatId, { text: '🎨 Generating light text... ⏳' });
  try {
    const { default: mumaker } = await import('mumaker');
    const result = await mumaker.ephoto(LIGHT_URL, inputText);
    if (!result || !result.image) { throw new Error('No image URL received'); }
    await sock.sendMessage(chatId, { image: { url: result.image }, caption: `✅ LIGHT TEXT\n\n📝 ${inputText}\n🎛️ Style: ${sess.styles[index - 1].label}` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chatId, { text: `❌ Failed to generate: ${e.message}` });
  }
}

async function generateNeonAvatar(sock, msg, args) {
  const chatId = msg.key.remoteJid;
  const text = args.join(' ').trim();
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
  let inner = quoted;
  if (!inner) { await sock.sendMessage(chatId, { text: '❌ Reply to an image with .neonavatar <text>' }); return; }
  if (inner.ephemeralMessage) inner = inner.ephemeralMessage.message;
  if (!inner.imageMessage) { await sock.sendMessage(chatId, { text: '❌ Reply to an image with .neonavatar <text>' }); return; }
  try {
    const buffer = await downloadMediaMessage({ message: quoted }, 'buffer');
    const baseSize = 800;
    const userImg = sharp(buffer).resize({ width: 600, height: 600, fit: 'cover' }).toBuffer();
    const bgSvg = `<svg width="${baseSize}" height="${baseSize}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#00eaff"/><stop offset="60%" stop-color="#001f2b"/><stop offset="100%" stop-color="#000914"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    const textSvg = `<svg width="${baseSize}" height="${baseSize}" xmlns="http://www.w3.org/2000/svg"><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><text x="50%" y="92%" text-anchor="middle" font-size="48" font-family="Arial" fill="#00eaff" filter="url(#glow)" style="letter-spacing:2px">${(text || 'FIAZZY-MD').slice(0,40)}</text></svg>`;
    const composed = await sharp(Buffer.from(bgSvg)).composite([
      { input: await userImg, top: 100, left: 100 },
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ]).png().toBuffer();
    await sock.sendMessage(chatId, { image: composed, caption: '✅ Blue Neon Avatar' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chatId, { text: `❌ Failed to create neon avatar: ${e.message}` });
  }
}

function registerEphotoCommands({ registerCommand }) {
  registerCommand('lightstyles', 'List styles for light effect', async (sock, msg) => { await listLightStyles(sock, msg); });
  registerCommand('lightstyle', 'Generate light text with selected style number', async (sock, msg, args) => { await generateLightWithStyle(sock, msg, args); });
  registerCommand('neonavatar', 'Create blue neon avatar from replied image', async (sock, msg, args) => { await generateNeonAvatar(sock, msg, args); });
  registerCommand('tattoo', 'Make tattoo effect by name (random style)', async (sock, msg, args) => {
    const chatId = msg.key.remoteJid;
    const text = args.join(' ').trim();
    if (!text) { await sock.sendMessage(chatId, { text: '❌ Usage: .tattoo <text>' }); return; }
    await sock.sendMessage(chatId, { text: '🎨 Generating tattoo effect... ⏳' });
    try {
      const { default: mumaker } = await import('mumaker');
      const result = await mumaker.ephoto('https://en.ephoto360.com/make-tattoos-online-by-your-name-309.html', text);
      if (!result || !result.image) { throw new Error('No image URL received'); }
      await sock.sendMessage(chatId, { image: { url: result.image }, caption: `✅ TATTOO\n\n📝 ${text}` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(chatId, { text: `❌ Failed to generate tattoo: ${e.message}` });
    }
  });
}

module.exports = registerEphotoCommands;