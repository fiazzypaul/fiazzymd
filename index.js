const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Session Manager
class SessionManager {
    constructor() {
        this.sessionsDir = 'sessions';
        this.currentSession = null;
        this.sessions = [];
        this.initSessionsDir();
    }

    initSessionsDir() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir);
            console.log('📁 Created sessions directory');
        }
        this.loadSessions();
    }

    loadSessions() {
        try {
            const dirs = fs.readdirSync(this.sessionsDir);
            this.sessions = dirs.filter(dir => {
                const sessionPath = path.join(this.sessionsDir, dir);
                return fs.statSync(sessionPath).isDirectory() &&
                       fs.existsSync(path.join(sessionPath, 'creds.json'));
            });
        } catch (error) {
            console.error('Error loading sessions:', error.message);
            this.sessions = [];
        }
    }

    async selectSession() {
        this.loadSessions();

        if (this.sessions.length === 0) {
            console.log('\n📝 No existing sessions found. Creating new session...');
            const sessionName = await question('Enter session name (default: session1): ') || 'session1';
            this.currentSession = sessionName;
            return path.join(this.sessionsDir, sessionName);
        }

        // Auto-connect if only one session exists
        if (this.sessions.length === 1) {
            this.currentSession = this.sessions[0];
            console.log(`\n✅ Auto-connecting to session: ${this.currentSession}\n`);
            return path.join(this.sessionsDir, this.currentSession);
        }

        // Multiple sessions - show menu
        console.log('\n📂 Available Sessions:\n');
        this.sessions.forEach((session, index) => {
            console.log(`  ${index + 1}. ${session}`);
        });
        console.log(`  ${this.sessions.length + 1}. Create new session\n`);

        const choice = await question(`Select session (1-${this.sessions.length + 1}): `);
        const sessionIndex = parseInt(choice) - 1;

        if (sessionIndex >= 0 && sessionIndex < this.sessions.length) {
            this.currentSession = this.sessions[sessionIndex];
            console.log(`\n✅ Selected session: ${this.currentSession}\n`);
            return path.join(this.sessionsDir, this.currentSession);
        } else if (sessionIndex === this.sessions.length) {
            const sessionName = await question('\nEnter new session name: ');
            if (!sessionName) {
                console.log('❌ Session name cannot be empty');
                process.exit(1);
            }
            this.currentSession = sessionName;
            return path.join(this.sessionsDir, sessionName);
        } else {
            console.log('❌ Invalid choice');
            process.exit(1);
        }
    }

    deleteSession(sessionName) {
        const sessionPath = path.join(this.sessionsDir, sessionName);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`🗑️  Deleted session: ${sessionName}`);
            this.loadSessions();
        }
    }

    listSessions() {
        this.loadSessions();
        return this.sessions;
    }
}

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function connectToWhatsApp(usePairingCode, sessionPath) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Chrome (Linux)', 'Chrome', '121.0.0'],
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 45000,
        markOnlineOnConnect: false,
        // Remove printQRInTerminal to avoid deprecation warning
    });

    // Handle pairing code
    if (usePairingCode && !sock.authState.creds.registered) {
        const phoneNumber = await question('\nPlease enter your WhatsApp phone number (with country code, no + or spaces): ');
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');

        console.log('\n🔄 Requesting pairing code for:', cleanNumber);

        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(cleanNumber);
                console.log('\n╔══════════════════════════╗');
                console.log(`║  📱 Pairing Code: ${code}  ║`);
                console.log('╚══════════════════════════╝\n');
                console.log('Enter this code in WhatsApp:');
                console.log('Settings > Linked Devices > Link a Device > Link with phone number instead\n');
            } catch (error) {
                console.error('❌ Error requesting pairing code:', error.message);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Handle QR code manually
        if (qr && !usePairingCode) {
            console.log('\n📱 Scan this QR code with WhatsApp:\n');
            // Use small: true to make QR code smaller
            qrcode.generate(qr, { small: true });
            console.log('\n'); // Add spacing after QR
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            console.log('❌ Connection closed.');
            console.log('📊 Reason code:', statusCode);

            if (statusCode === DisconnectReason.loggedOut) {
                console.log('\n❌ Logged out. Delete session folder and re-authenticate.\n');
                rl.close();
                process.exit(0);
            } else {
                // Auto-reconnect for all other errors
                reconnectAttempts++;

                if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
                    console.log('\n❌ Max reconnection attempts reached.');
                    console.log('⚠️  Please wait a few minutes before restarting the bot.');
                    console.log('💡 Tip: Try deleting the session folder if problem persists.\n');
                    rl.close();
                    process.exit(1);
                }

                const delay = Math.min(3000 * reconnectAttempts, 15000); // Exponential backoff, max 15s
                console.log(`🔄 Reconnecting in ${delay/1000} seconds... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})\n`);
                setTimeout(() => connectToWhatsApp(usePairingCode, sessionPath), delay);
            }
        } else if (connection === 'open') {
            // Reset reconnect attempts on successful connection
            reconnectAttempts = 0;

            console.log('\n╔════════════════════════════════════╗');
            console.log('║   ✅ Connected Successfully!        ║');
            console.log('╚════════════════════════════════════╝\n');
            console.log('📞 Bot is ready to receive messages\n');

            // Wait 10 seconds before sending welcome message to ensure stable connection
            console.log('⏳ Waiting for connection to stabilize...\n');
            setTimeout(async () => {
                try {
                    const userJid = sock.user.id.replace(':', '@s.whatsapp.net');
                    await sock.sendMessage(userJid, {
                        text: '🎉 *FiazzyMD Bot Connected Successfully!*\n\n' +
                              '✅ Your bot is now online and ready to respond to messages.\n\n' +
                              '📱 Connection Details:\n' +
                              `• Device: ${sock.user.name || 'FiazzyMD'}\n` +
                              `• Number: ${sock.user.id.split(':')[0]}\n` +
                              `• Session: ${sessionManager.currentSession}\n` +
                              `• Method: ${usePairingCode ? 'Pairing Code' : 'QR Code'}\n\n` +
                              '🤖 Available Commands:\n' +
                              '• ping - Check bot status\n' +
                              '• hi/hello - Get a greeting\n' +
                              '• help - Show help menu\n' +
                              '• session - View session info\n\n' +
                              '💡 The bot will auto-reply to these commands from any chat!'
                    });
                    console.log('📨 Welcome message sent to your DM!\n');
                } catch (error) {
                    console.error('⚠️  Could not send welcome DM:', error.message);
                    console.log('💡 Connection is stable, but message failed. Bot is still running.\n');
                }
            }, 10000); // Wait 10 seconds before sending first message
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];

        if (!msg.key.fromMe && m.type === 'notify') {
            console.log('📩 New message from:', msg.key.remoteJid);

            // Extract message text
            const messageText = msg.message?.conversation ||
                              msg.message?.extendedTextMessage?.text ||
                              '';

            if (messageText) {
                console.log('💬 Message:', messageText);

                // Command handler
                const command = messageText.toLowerCase().trim();

                if (command === 'ping') {
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: '🏓 Pong! Bot is active and running.\n\n⏰ Response time: ' + new Date().toLocaleTimeString()
                    });
                } else if (command === 'hi' || command === 'hello') {
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: '👋 Hello! I am FiazzyMD WhatsApp Bot.\n\n' +
                              '🤖 Available commands:\n' +
                              '• ping - Check bot status\n' +
                              '• hi/hello - Get greeting\n' +
                              '• help - Show help menu\n' +
                              '• session - View session info'
                    });
                } else if (command === 'help') {
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: '🤖 *FiazzyMD Bot Help*\n\n' +
                              '📌 Available Commands:\n\n' +
                              '• *ping* - Check if bot is active\n' +
                              '• *hi/hello* - Get a greeting\n' +
                              '• *help* - Show this help message\n' +
                              '• *session* - View current session info\n\n' +
                              '✨ More features coming soon!'
                    });
                } else if (command === 'session') {
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: '📊 *Session Information*\n\n' +
                              `• Session Name: ${sessionManager.currentSession}\n` +
                              `• Device: ${sock.user.name || 'FiazzyMD'}\n` +
                              `• Number: ${sock.user.id.split(':')[0]}\n` +
                              `• Status: Active ✅`
                    });
                }
            }
        }
    });

    return sock;
}

const sessionManager = new SessionManager();

async function showMenu() {
    console.log('\n╔════════════════════════════════════╗');
    console.log('║   🤖 FiazzyMD WhatsApp Bot Setup   ║');
    console.log('╚════════════════════════════════════╝\n');

    // Session selection
    const sessionPath = await sessionManager.selectSession();

    // Check if session already has credentials
    if (fs.existsSync(path.join(sessionPath, 'creds.json'))) {
        console.log('✅ Found existing credentials. Reconnecting...\n');
        return await connectToWhatsApp(false, sessionPath);
    }

    console.log('Choose your connection method:\n');
    console.log('  1️⃣  QR Code (Scan with phone)');
    console.log('  2️⃣  Pairing Code (Enter code on phone)\n');

    const choice = await question('Enter your choice (1 or 2): ');

    console.log(''); // Empty line for spacing

    if (choice === '1') {
        console.log('🔄 Starting QR Code authentication...\n');
        return await connectToWhatsApp(false, sessionPath);
    } else if (choice === '2') {
        console.log('🔄 Starting Pairing Code authentication...\n');
        return await connectToWhatsApp(true, sessionPath);
    } else {
        console.log('❌ Invalid choice. Please run the bot again and select 1 or 2.\n');
        rl.close();
        process.exit(1);
    }
}

// Start the bot
console.log('\n🚀 Starting FiazzyMD WhatsApp Bot...');

showMenu().catch(err => {
    console.error('❌ Error starting bot:', err);
    rl.close();
    process.exit(1);
});
