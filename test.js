const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
console.log(` ${sessions.length+1}. Create new session
`);
const choice = await question(`Select session (1-${sessions.length+1}): `);
const idx = parseInt(choice) - 1;
if (idx >= 0 && idx < sessions.length) {
const name = sessions[idx];
sessionManager.currentSession = name;
const p = path.join(SESSIONS_DIR, name);
console.log(`
✅ Selected session: ${name}
`);
const hasCreds = sessionManager.hasCreds(name);
if (hasCreds) await startConnection(p, false);
else {
console.log('
Choose your connection method:
1) QR Code (scan)
2) Pairing Code (phone number)
');
const c = await question('Enter choice (1 or 2): ');
await startConnection(p, c === '2');
}
return;
}


if (idx === sessions.length) {
const name = await question('Enter new session name: ');
if (!name) { console.log('❌ Session name required'); process.exit(1); }
sessionManager.createPath(name);
sessionManager.currentSession = name;
const p = path.join(SESSIONS_DIR, name);
console.log('
Choose your connection method:
1) QR Code (scan)
2) Pairing Code (phone number)
');
const c = await question('Enter choice (1 or 2): ');
await startConnection(p, c === '2');
return;
}


console.log('❌ Invalid selection');
process.exit(1);
}


// Graceful shutdown
process.on('SIGINT', () => {
console.log('
Received SIGINT, exiting...');
isShuttingDown = true;
try { if (reconnectTimer) clearTimeout(reconnectTimer); } catch {};
try { if (activeSock) { activeSock.ev.removeAllListeners(); activeSock.ws.close(); } } catch {};
try { rl.close(); } catch {};
process.exit(0);
});


// Start
console.log('
🚀 Starting FiazzyMD WhatsApp Bot...');
showMenuAndStart().catch(err => {
console.error('❌ Fatal error starting bot:', err?.message || err);
try { rl.close(); } catch {};
process.exit(1);
});