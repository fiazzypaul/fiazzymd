require('dotenv').config();

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage, Browsers, fetchLatestBaileysVersion, jidNormalizedUser } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { createStickerBuffer } = require('./features/sticker');
const gifFeature = require('./features/gif');
const CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S';
const CHANNEL_CONTEXT = {
  contextInfo: {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363423276650635@newsletter',
      newsletterName: 'FIAZZY-MD',
      serverMessageId: -1
    }
  }
};
const autoStatus = require('./features/autostatus');
const { enableWelcome, disableWelcome, isWelcomeEnabled, sendWelcomeMessage, sendGoodbyeMessage } = require('./features/welcome');
const gemini = require('./features/gemini');
const imagesCF = require('./features/images_cf');
const images = require('./features/images');
const fancytext = require('./features/fancytext');
const createPermissions = require('./permissions');
const songs = require('./features/songs');
const ytvideo = require('./features/ytvideo');
const youtube = require('./lib/youtube');
const tiktokDownloader = require('./lib/tiktok');
const { searchMovies, getTrendingMovies, getRandomMovie, formatMovieResults, formatMovieDetails } = require('./features/movies');
const { searchAnime, getTopAnime, getSeasonalAnime, getRandomAnime, formatAnimeResults, formatAnimeDetails } = require('./features/anime');
const anime2 = require('./features/anime2');
const presence = require('./features/presence');
const alive = require('./features/alive');
const ytsFeature = require('./features/yts');
const scheduler = require('./features/scheduler');
const { updateGroupProfilePicture } = require('./features/gpp');
const tictactoe = require('./features/tictactoe');
const wcg = require('./features/wcg');
const textmaker = require('./features/textmaker');
const trivia = require('./features/trivia');
const weather = require('./features/weather');
const jids = require('./features/jids');
const system = require('./features/system');
const registerGroupCommands = require('./features/group');
const mediafire = require('./lib/mediafire');
const convertStickerToImage = require('./features/simage');
const registerMediafireCommand = require('./features/mediafire');
const registerAntiwordsCommand = require('./features/antiwords');
const { extractAudioToMp3, reverseMedia } = require('./lib/audio');
const registerApkCommand = require('./features/apk');
const registerEmojimixCommand = require('./features/emojimix');
const saveStatus = require('./lib/saveStatus');
const registerEphotoCommands = require('./features/ephoto');
const sudoFeature = require('./features/sudo');
const { flirtCommand } = require('./features/flirt');
const handleSticker2 = require('./features/sticker2');
const { dareCommand } = require('./features/dare');
const registerOtplockCommand = require('./features/otplock');
const { bass, speed, cut } = require('./features/audio_editor');
const registerHelpCommand = require('./features/help');
const registerOwnerCommands = require('./features/pp');
const registerMemeCommands = require('./features/meme');
const registerNsfwCommands = require('./features/nsfw');
const spotify = require('./features/spotify');

// Bot Configuration from .env
const config = {
    botMode: process.env.BOT_MODE || 'public',
    prefix: process.env.PREFIX || '.',
    ownerNumber: process.env.OWNER_NUMBER || '',
    botName: process.env.BOT_NAME || 'FiazzyMD',
    botVersion: process.env.BOT_VERSION || '1.0.0',
};

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Helper function to update .env file
function updateEnvFile(key, value) {
    try {
        const envPath = path.join(__dirname, '.env');
        let envContent = '';

        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        const lines = envContent.split('\n');
        let found = false;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith(`${key}=`)) {
                lines[i] = `${key}=${value}`;
                found = true;
                break;
            }
        }

        if (!found) {
            lines.push(`${key}=${value}`);
        }

        fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
        return true;
    } catch (error) {
        console.error('Error updating .env file:', error);
        return false;
    }
}

// Command Registry
const commands = new Map();

// Mute timers storage
const muteTimers = new Map();
const autoViewOnceChats = new Set();
const messageStore = new Map();
const antiLinkSettings = new Map();
const warnLimits = new Map();
const warnCounts = new Map();
const antiDeleteChats = new Map();
let connectedAtMs = 0;
const CONNECT_GRACE_MS = 3000;

const antiLinkFile = path.join(__dirname, 'data', 'antilink.json');
function ensureDataDirLocal() { try { const dir = path.join(__dirname, 'data'); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {} }
function loadAntiLinkSettingsFromDisk() {
    try {
        if (!fs.existsSync(antiLinkFile)) return;
        const raw = fs.readFileSync(antiLinkFile, 'utf8');
        const obj = JSON.parse(raw || '{}');
        Object.entries(obj).forEach(([jid, cfg]) => {
            if (jid && cfg && typeof cfg === 'object') antiLinkSettings.set(jid, { enabled: !!cfg.enabled, action: cfg.action === 'kick' ? 'kick' : 'warn' });
        });
    } catch {}
}
function saveAntiLinkSettingsToDisk() {
    try {
        ensureDataDirLocal();
        const obj = {};
        for (const [jid, cfg] of antiLinkSettings.entries()) { obj[jid] = { enabled: !!(cfg && cfg.enabled), action: (cfg && cfg.action) === 'kick' ? 'kick' : 'warn' }; }
        fs.writeFileSync(antiLinkFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch {}
}
loadAntiLinkSettingsFromDisk();

// Initialize auto view-once from .env
if (process.env.AUTO_VIEW_ONCE === 'true') {
    autoViewOnceChats.add('global');
}

// Initialize anti-delete from .env (global)
if (process.env.AUTO_ANTI_DELETE === 'true') {
    antiDeleteChats.set('global', true);
}

function registerCommand(name, description, handler) {
    commands.set(name, { description, handler });
}

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
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.appropriate('Chrome'),
        version,
        printQRInTerminal: false,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 45000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        getMessage: async (key) => {
            const k = `${key.remoteJid}:${key.id}`;
            const m = messageStore.get(k);
            return m || undefined;
        },
    });

    registerCommand('uptime', 'Show bot uptime', async (sock, msg) => {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is restricted to the bot owner.' });
        }
        await sock.sendMessage(msg.key.remoteJid, { text: `⏱️ Bot Uptime: ${system.getUptime()}` });
    });

    registerCommand('pm2status', 'Show PM2 management status', async (sock, msg) => {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is restricted to the bot owner.' });
        }
        const managed = system.isManagedByPM2();
        const text = managed ? `✅ Managed by PM2 (pm_id=${process.env.pm_id})` : '❌ Not managed by PM2. Use npm run pm2 to start.';
        await sock.sendMessage(msg.key.remoteJid, { text });
    });

    registerCommand('restart', 'Restart bot', async (sock, msg) => {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is restricted to the bot owner.' });
        }
        if (!system.isManagedByPM2()) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Not running under PM2. Start the bot with PM2 to enable safe restarts.' });
        }
        await sock.sendMessage(msg.key.remoteJid, { text: '🔄 Restarting the bot...' });
        system.restartBot();
    });

    registerCommand('update', 'Update bot from repo and restart', async (sock, msg) => {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is restricted to the bot owner.' });
        }
        if (!system.isManagedByPM2()) {
            await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Not running under PM2. The bot will not auto-restart after update. Start with PM2 for safe updates.' });
        }
        await sock.sendMessage(msg.key.remoteJid, { text: '⬇️ Starting update and restart process. Please wait...' });
        const result = await system.updateAndRestart();
        if (!result.success || (result.message || '').includes('already up to date')) {
            await sock.sendMessage(msg.key.remoteJid, { text: result.message });
        }
    });

    // MediaFire Download Command
    registerCommand('mediafire', 'Download files from MediaFire', async (sock, msg, args) => {
        if (args.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📁 *MEDIAFIRE DOWNLOADER*

` +
                      `*Usage:* ${config.prefix}mediafire <mediafire_url>

` +
                      `*Examples:*
` +
                      `${config.prefix}mediafire https://www.mediafire.com/file/abc123/filename.zip
` +
                      `${config.prefix}mediafire https://www.mediafire.com/file/xyz789/document.pdf

` +
                      `💡 Supports all MediaFire file types`
            });
            return;
        }

        const url = args[0];
        
        // Validate URL
        if (!url.includes('mediafire.com')) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Invalid MediaFire URL. Please provide a valid MediaFire link.'
            });
            return;
        }

        try {
            // Send initial message
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📁 *Processing MediaFire link...*

🔗 URL: ${url}
⏳ Please wait while I extract the download link...`
            });

            // Extract download information
            const result = await mediafire(url);
            
            if (!result) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Could not extract download link from MediaFire. The file might be removed or the URL is invalid.'
                });
                return;
            }

            // Send download information
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📁 *MediaFire File Found!*

` +
                      `📄 *Filename:* ${result.filename}
` +
                      `📊 *Size:* ${result.size}
` +
                      `🔗 *Download Link:* ${result.url}

` +
                      `💡 Click the link above to download the file directly.`
            });

        } catch (error) {
            console.error('MediaFire download error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Error processing MediaFire link: ${error.message}`
            });
        }
    });

    // Prepare pairing code number if using pairing mode
    let pairingNumber = null;
    let pairingCodeRequested = false;

    if (usePairingCode && !sock.authState.creds.registered) {
        let cleanNumber = (process.env.PAIR_NUMBER || '').replace(/[^0-9]/g, '');
        if (!cleanNumber) {
            const phoneNumber = await question('\n📱 Enter your WhatsApp phone number:\n   (with country code, no + or spaces)\n   Example: 2349012345678\n\n   Number: ');
            cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        }

        if (!cleanNumber || cleanNumber.length < 10) {
            console.error('\n❌ Invalid phone number format');
            console.log('💡 Number must be in E.164 format without +');
            console.log('   Example: 2349012345678 (not +234 901 234 5678)\n');
            rl.close();
            process.exit(1);
        }

        pairingNumber = cleanNumber;
        console.log('\n✅ Phone number validated:', cleanNumber);
        console.log('⏳ Waiting for connection to initialize...\n');
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Request pairing code ONLY when QR is available (connection is ready)
        if (pairingNumber && !pairingCodeRequested && !sock.authState.creds.registered && qr) {
            pairingCodeRequested = true;
            console.log('🔄 Requesting pairing code for:', pairingNumber);
            try {
                const code = await sock.requestPairingCode(pairingNumber);
                console.log('\n╔════════════════════════════════╗');
                console.log('║                                ║');
                console.log(`║    📟 PAIRING CODE: ${code}     ║`);
                console.log('║                                ║');
                console.log('╚════════════════════════════════╝\n');
                console.log('📌 Steps to link your device:\n');
                console.log('   1. Open WhatsApp on your phone');
                console.log('   2. Tap Settings → Linked Devices');
                console.log('   3. Tap "Link a Device"');
                console.log('   4. Tap "Link with phone number instead"');
                console.log('   5. Enter the code above: ' + code + '\n');
                console.log('⏳ Waiting for you to enter the code (up to 2 minutes)...\n');
            } catch (error) {
                console.error('\n❌ Failed to request pairing code:', error.message);
                console.log('\n💡 Troubleshooting:');
                console.log('   • Verify phone number format (must include country code)');
                console.log('   • Delete session folder if code doesn\'t match number');
                console.log('   • Wait 10 minutes if too many attempts\n');
                rl.close();
                process.exit(1);
            }
        }

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
            connectedAtMs = Date.now();
            console.log('✅ Connection successful!\n');

            // Auto-detect and set owner number from bot's login
            const botOwnNumber = sock.user.id.split(':')[0];
            config.ownerNumber = botOwnNumber;

            // Update .env with owner number if not set or different
            if (process.env.OWNER_NUMBER !== botOwnNumber) {
                updateEnvFile('OWNER_NUMBER', botOwnNumber);
                process.env.OWNER_NUMBER = botOwnNumber;
            }

            console.log('\n╔════════════════════════════════════╗');
            console.log('║   ✅ Connected Successfully!        ║');
            console.log('╚════════════════════════════════════╝\n');
            console.log('📞 Bot is ready to receive messages\n');
            console.log(`🔑 Bot Owner: ${botOwnNumber}\n`);
            console.log('💡 Bot is active and ready to respond to commands!\n');

            // Start presence loop if global presence is enabled
            try {
                startPresenceLoop(sock);
            } catch {}

            // Start message scheduler
            try {
                scheduler.startScheduler(sock);
            } catch {}

            // Track last notified commit to prevent duplicate notifications
            let lastNotifiedCommit = null;

            try {
                setInterval(async () => {
                    try {
                        const res = await system.checkForUpdates();
                        if (res.hasUpdates && res.remoteCommit) {
                            // Only notify if this is a NEW commit we haven't notified about
                            if (res.remoteCommit !== lastNotifiedCommit) {
                                lastNotifiedCommit = res.remoteCommit;
                                const ownerJid = String(config.ownerNumber).replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                                await sock.sendMessage(ownerJid, { text: `🔔 ${res.message}` });
                            }
                        }
                    } catch {}
                }, 5 * 60 * 1000);
            } catch {}

            // Send welcome message after 20 seconds
            console.log('⏳ Will send welcome message in 20 seconds...\n');
            setTimeout(async () => {
                try {
                    // Get user's own JID (phone number)
                    const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

                    await sock.sendMessage(userJid, {
                        text: '╭────────────────────╮\n' +
                              '│  🎉 *BOT CONNECTED*  │\n' +
                              '╰────────────────────╯\n\n' +
                              '✅ *FiazzyMD is now online!*\n\n' +
                              '📱 *Connection Details:*\n' +
                              `• Device: ${sock.user.name || config.botName}\n` +
                              `• Number: ${sock.user.id.split(':')[0]}\n` +
                              `• Session: ${sessionManager.currentSession}\n` +
                              `• Mode: ${config.botMode.toUpperCase()}\n` +
                              `• Method: ${usePairingCode ? 'Pairing Code' : 'QR Code'}\n\n` +
                              '🤖 *Quick Commands:*\n' +
                              `• ${config.prefix}menu - View all commands\n` +
                              `• ${config.prefix}ping - Check bot status\n` +
                              `• ${config.prefix}help - Get help\n` +
                              `• ${config.prefix}session - Session info\n\n` +
                              '💡 Bot is ready to respond in all chats!'
                    });
                    console.log('✅ Welcome message sent to your DM!\n');
                } catch (error) {
                    console.error('⚠️  Could not send welcome DM:', error.message);
                    console.log('💡 This is normal - bot will still work fine\n');
                }
            }, 20000); // Wait 20 seconds before sending first message
        }
    });

    sock.ev.on('creds.update', saveCreds);
    const Permissions = createPermissions(config);

    // Helper function to check if chat is a group
    const isGroup = Permissions.isGroup;

    // Helper function to check if user is admin
    const isUserAdmin = (sock, groupJid, userJid) => Permissions.isUserAdmin(sock, groupJid, userJid);

    const groupAdminCommands = Permissions.groupAdminCommands;
    const groupOnlyCommands = Permissions.groupOnlyCommands;
    const generalCommands = Permissions.generalCommands;
    const varCommands = Permissions.varCommands;

    const getSenderNumber = (msg) => Permissions.getSenderNumber(msg);

    const canRunCommand = (sock, msg, cmdName) => Permissions.canRunCommand(sock, msg, cmdName);

    const PermissionsObj = Permissions;

    // Reusable permission checker for admin commands
    const checkAdminPermission = async (sock, msg) => {
        // Check if it's a group
        if (!isGroup(msg.key.remoteJid)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
            return { allowed: false };
        }

        // Robust owner detection (handles LIDs and self messages)
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;

        // Owner can bypass all checks
        if (isOwner) {
            return { allowed: true, isOwner: true };
        }

        // Check bot mode
        if (config.botMode === 'private') {
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is restricted to bot owner in private mode!'
            });
            return { allowed: false };
        }

        // Check if user is admin
        if (!(await isUserAdmin(sock, msg.key.remoteJid, msg.key.participant))) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only admins can use this command!'
            });
            return { allowed: false };
        }

        return { allowed: true, isOwner: false };
    };

    // Register Commands
    registerCommand('menu', 'Display bot menu with all commands', async (sock, msg) => {
        const menuText = `╭──────────────────────╮
│                                      │
│      *《 FIAZZYMD 》*      │
│                                      │
╰──────────────────────╯

╭─────────────────────╮
│  📌 *BOT INFO*  │
╰─────────────────────╯
│ Prefix: ${config.prefix}
│ Mode: ${config.botMode.toUpperCase()}
│ Commands: ${commands.size}
╰─────────────────────╯

╭──────────────────────╮
│  👥 *GROUP*  │
╰──────────────────────╯
│ ${config.prefix}add
│ ${config.prefix}kick
│ ${config.prefix}kickall
│ ${config.prefix}kickgroup
│ ${config.prefix}promote
│ ${config.prefix}demote
│ ${config.prefix}tag
│ ${config.prefix}tagall
│ ${config.prefix}mute
│ ${config.prefix}unmute
│ ${config.prefix}warn
│ ${config.prefix}resetwarn
│ ${config.prefix}antilink
│ ${config.prefix}antiword
│ ${config.prefix}welcome
│ ${config.prefix}gpp
│ ${config.prefix}left
│ ${config.prefix}invite
│ ${config.prefix}revoke
│ ${config.prefix}ginfo
╰──────────────────────╯

╭──────────────────────╮
│  ⚙️ *GENERAL*  │
╰──────────────────────╯
│ ${config.prefix}ping
│ ${config.prefix}help
│ ${config.prefix}session
│ ${config.prefix}repo
│ ${config.prefix}vv
│ ${config.prefix}block
│ ${config.prefix}del
│ ${config.prefix}sticker
│ ${config.prefix}sticker2
│ ${config.prefix}img
│ ${config.prefix}getjid
│ ${config.prefix}savejid
│ ${config.prefix}gemini
│ ${config.prefix}alive
│ ${config.prefix}wapresence
│ ${config.prefix}schedule
│ ${config.prefix}schedules
│ ${config.prefix}schedulecancel
│ ${config.prefix}uptime
│ ${config.prefix}restart
│ ${config.prefix}update
│ ${config.prefix}autostatus
│ ${config.prefix}flirt
│ ${config.prefix}dare
╰──────────────────────╯

╭──────────────────────╮
│  🧪 *TEST FEATURES*  │
╰──────────────────────╯
│ ${config.prefix}otplock
╰──────────────────────╯

╭──────────────────────╮
│  📥 *DOWNLOADS*  │
╰──────────────────────╯
│ ${config.prefix}song
│ ${config.prefix}ytvideo
│ ${config.prefix}tiktok
│ ${config.prefix}yts
│ ${config.prefix}mediafire
│ ${config.prefix}apk
╰──────────────────────╯

╭──────────────────────╮
│  🎵 *AUDIO*  │
╰──────────────────────╯
│ ${config.prefix}mp3
│ ${config.prefix}reverse
│ ${config.prefix}bass
│ ${config.prefix}speed
│ ${config.prefix}cut
╰──────────────────────╯

╭──────────────────────╮
│  🎨 *TEXT MAKER*  │
╰──────────────────────╯
│ ${config.prefix}metallic
│ ${config.prefix}fire
│ ${config.prefix}neon
│ ${config.prefix}glitch
│ ${config.prefix}matrix
│ ${config.prefix}luxurygold
│ ${config.prefix}chrome
│ ${config.prefix}thunder
│ ${config.prefix}ice
│ ${config.prefix}snow
│ ${config.prefix}purple
│ ${config.prefix}devil
│ ${config.prefix}hacker
│ ${config.prefix}light
│ ${config.prefix}lightstyles
│ ${config.prefix}lightstyle
│ ${config.prefix}tattoo
│ ${config.prefix}impressive
│ ${config.prefix}leaves
│ ${config.prefix}sand
│ ${config.prefix}blackpink
│ ${config.prefix}1917
│ ${config.prefix}arena
│ ${config.prefix}wings
│ ${config.prefix}christmas1
│ ${config.prefix}christmas2
│ ${config.prefix}frost
│ ${config.prefix}deadpool
│ ${config.prefix}neonavatar
│ ${config.prefix}game1
│ ${config.prefix}game2
│ ${config.prefix}dbz
│ ${config.prefix}naruto
│ ${config.prefix}pixelglitch
│ ${config.prefix}arrow
╰──────────────────────╯

╭──────────────────────╮
│  🎬 *ENTERTAINMENT*  │
╰──────────────────────╯
│ ${config.prefix}movie
│ ${config.prefix}anime
│ ${config.prefix}anime2
│ ${config.prefix}emojimix
╰──────────────────────╯

╭──────────────────────╮
│  🎭 *MEME*  │
╰──────────────────────╯
│ ${config.prefix}kill
│ ${config.prefix}hug
│ ${config.prefix}kiss
│ ${config.prefix}slap
│ ${config.prefix}punch
│ ${config.prefix}party
│ ${config.prefix}winner
│ ${config.prefix}cry
│ ${config.prefix}bite
│ ${config.prefix}happy
│ ${config.prefix}pat
╰──────────────────────╯

╭──────────────────────╮
│  🔞 *NSFW*  │
╰──────────────────────╯
│ ${config.prefix}goon1
│ ${config.prefix}goon2
╰──────────────────────╯

╭──────────────────────╮
│  🎮 *GAMES*  │
╰──────────────────────╯
│ ${config.prefix}ttt
│ ${config.prefix}wcg
│ ${config.prefix}trivia
╰──────────────────────╯

╭──────────────────────╮
│  🌤️ *WEATHER & INFO*  │
╰──────────────────────╯
│ ${config.prefix}weather
│ ${config.prefix}forecast
╰──────────────────────╯

╭──────────────────────╮
│  🧩 *VAR COMMANDS*  │
╰──────────────────────╯
│ ${config.prefix}seevar
│ ${config.prefix}mode
│ ${config.prefix}prefix
│ ${config.prefix}ownernumber
│ ${config.prefix}setvar
│ ${config.prefix}autoviewonce
│ ${config.prefix}antidelete
│ ${config.prefix}setsudo
│ ${config.prefix}delsudo
│ ${config.prefix}seesudo
╰──────────────────────╯

💡 ${config.prefix}help <command> for usage
${config.botMode === 'private' ? '🔒 Private Mode' : '🌐 Public Mode'}`;

        // Check if menu image exists (supports multiple formats)
        const imageFormats = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
        let menuImagePath = null;

        for (const format of imageFormats) {
            const imagePath = path.join(__dirname, `menu_img.${format}`);
            if (fs.existsSync(imagePath)) {
                menuImagePath = imagePath;
                console.log(`✅ Found menu image: menu_img.${format}`);
                break;
            }
        }

        try {
            if (menuImagePath) {
                // Send with image
                console.log('📤 Sending menu with image...');
                await sock.sendMessage(msg.key.remoteJid, {
                    image: fs.readFileSync(menuImagePath),
                    caption: menuText,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363423276650635@newsletter',
                            newsletterName: 'FIAZZY-MD',
                            serverMessageId: -1
                        }
                    }
                });
            console.log('✅ Menu sent successfully with image');
        } else {
            // Send text only if image doesn't exist
            console.log('📤 Sending menu as text (no image found)...');
            await sock.sendMessage(msg.key.remoteJid, { 
                    text: menuText,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363423276650635@newsletter',
                            newsletterName: 'FIAZZY-MD',
                            serverMessageId: -1
                        }
                    }
                });
            console.log('✅ Menu sent successfully as text');
        }
        } catch (error) {
            // Fallback to text if image fails
            console.error('⚠️  Failed to send menu with image:', error.message);
            console.log('📤 Fallback: Sending menu as text...');
            await sock.sendMessage(msg.key.remoteJid, { 
                text: menuText,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363423276650635@newsletter',
                        newsletterName: 'FIAZZY-MD',
                        serverMessageId: -1
                    }
                }
            });
            console.log('✅ Menu sent successfully as text (fallback)');
        }
    });

    // Group Commands (moved to features/group.js)

    // kick moved to features/group.js

    // kickall moved to features/group.js

    // promote moved to features/group.js

    // demote moved to features/group.js

    // tag moved to features/group.js

    // tagall moved to features/group.js

    const unwrapViewOnce = (m) => {
        if (!m) {
            console.log('🔍 unwrapViewOnce: No message provided');
            return null;
        }

        console.log('🔍 unwrapViewOnce: Message keys:', Object.keys(m));

        let x = m;

        // Unwrap ephemeral first
        if (x.ephemeralMessage) {
            console.log('🔍 unwrapViewOnce: Unwrapping ephemeralMessage');
            x = x.ephemeralMessage.message;
            console.log('🔍 unwrapViewOnce: After ephemeral unwrap, keys:', Object.keys(x));
        }

        // Check all view-once variants (try V2 first as it's most common)
        if (x.viewOnceMessageV2) {
            console.log('✅ unwrapViewOnce: Found viewOnceMessageV2');
            if (x.viewOnceMessageV2.message) {
                console.log('🔍 Inner message keys:', Object.keys(x.viewOnceMessageV2.message));
                return x.viewOnceMessageV2.message;
            }
        }

        if (x.viewOnceMessage) {
            console.log('✅ unwrapViewOnce: Found viewOnceMessage (V1)');
            if (x.viewOnceMessage.message) {
                console.log('🔍 Inner message keys:', Object.keys(x.viewOnceMessage.message));
                return x.viewOnceMessage.message;
            }
        }

        if (x.viewOnceMessageV2Extension) {
            console.log('✅ unwrapViewOnce: Found viewOnceMessageV2Extension');
            if (x.viewOnceMessageV2Extension.message) {
                console.log('🔍 Inner message keys:', Object.keys(x.viewOnceMessageV2Extension.message));
                return x.viewOnceMessageV2Extension.message;
            }
        }

        console.log('❌ unwrapViewOnce: No view-once message found');
        console.log('Available keys:', Object.keys(x));
        return null;
    };

    const getQuotedMessage = (msg) => {
        if (!msg || !msg.message) return null;
        let m = msg.message;
        if (m.ephemeralMessage) m = m.ephemeralMessage.message;

        // Check all possible message types for contextInfo
        const candidates = [
            m.extendedTextMessage,
            m.imageMessage,
            m.videoMessage,
            m.documentMessage,
            m.audioMessage,
            m.stickerMessage,
            m.buttonsResponseMessage,
            m.templateButtonReplyMessage,
            m.conversation ? { contextInfo: m.contextInfo } : null
        ];

        for (const c of candidates) {
            if (!c || !c.contextInfo) continue;
            const ctx = c.contextInfo;

            // First try: stanzaId lookup in messageStore (most reliable for view-once)
            const stanzaId = ctx.stanzaId || ctx.stanzaIdV2 || ctx.quotedStanzaID;
            if (stanzaId) {
                const loaded = messageStore.get(`${msg.key.remoteJid}:${stanzaId}`);
                if (loaded) {
                    console.log('✅ Found quoted message via stanzaId:', stanzaId);
                    console.log('🔍 Loaded message keys:', Object.keys(loaded));
                    return loaded;
                }
            }

            // Second try: direct quotedMessage (may be unwrapped for view-once)
            if (ctx.quotedMessage) {
                console.log('✅ Found quoted message via contextInfo.quotedMessage');
                console.log('🔍 Quoted message keys:', Object.keys(ctx.quotedMessage));
                return ctx.quotedMessage;
            }
        }

        console.log('❌ No quoted message found');
        return null;
    };

    registerCommand('vv', 'Open and resend a view-once media', async (sock, msg) => {
        console.log('🔍 VV Command Debug:');
        console.log('Message keys:', Object.keys(msg));
        console.log('Message.message keys:', msg.message ? Object.keys(msg.message) : 'none');

        // Get contextInfo to check if quoted message was view-once
        let contextInfo = null;
        const m = msg.message;
        if (m.extendedTextMessage?.contextInfo) {
            contextInfo = m.extendedTextMessage.contextInfo;
        }

        console.log('🔍 ContextInfo:', contextInfo ? 'Found' : 'Not found');
        if (contextInfo) {
            console.log('🔍 ContextInfo keys:', Object.keys(contextInfo));
            console.log('🔍 Quoted message type:', contextInfo.quotedMessage ? Object.keys(contextInfo.quotedMessage)[0] : 'none');
        }

        const quotedMsg = getQuotedMessage(msg);
        console.log('Quoted message:', quotedMsg ? 'Found' : 'Not found');

        if (!quotedMsg) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Please reply to a view-once message with ${config.prefix}vv`
            });
            return;
        }

        console.log('🔍 Quoted message keys:', Object.keys(quotedMsg));

        // Check if it's actually a view-once message
        // Method 1: Check for view-once wrapper
        let checkMsg = quotedMsg;
        if (checkMsg.ephemeralMessage) {
            console.log('🔍 Found ephemeral wrapper in quoted message');
            checkMsg = checkMsg.ephemeralMessage.message;
            console.log('🔍 After unwrapping ephemeral, keys:', Object.keys(checkMsg));
        }

        let hasViewOnce = checkMsg.viewOnceMessage || checkMsg.viewOnceMessageV2 || checkMsg.viewOnceMessageV2Extension;

        // Method 2: Check contextInfo for view-once indicator (newer WhatsApp versions)
        if (!hasViewOnce && contextInfo) {
            // If contextInfo has isViewOnce flag or quotedMessage came from view-once
            hasViewOnce = contextInfo.isViewOnce === true ||
                         contextInfo.isViewOnce === 1 ||
                         (contextInfo.quotedMessage && (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage));
        }

        console.log('🔍 Has view-once?', !!hasViewOnce);

        const isQuotedMedia = !!(quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage);
        if (!hasViewOnce && !isQuotedMedia) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ That's not a view-once message!\n\n💡 The message you replied to is a regular ${Object.keys(checkMsg)[0] || 'message'}`
            });
            return;
        }

        // Try to unwrap view-once, if it fails, use quotedMsg directly (already unwrapped)
        let inner = unwrapViewOnce(quotedMsg);
        console.log('View-once unwrapped:', inner ? 'Yes' : 'No');

        // If unwrapping failed, quotedMsg might already be the inner content
        if (!inner && (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage)) {
            console.log('🔍 Using quotedMsg directly (already unwrapped)');
            inner = quotedMsg;
        }

        if (!inner) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to unwrap view-once message`
            });
            return;
        }

        try {
            console.log('📥 Downloading view-once media...');
            const buffer = await downloadMediaMessage({ message: inner }, 'buffer', {}, { logger: pino({ level: 'silent' }) });

            if (inner.imageMessage) {
                console.log('📤 Sending image...');
                await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption: 'Opened view-once 👀' });
            } else if (inner.videoMessage) {
                console.log('📤 Sending video...');
                await sock.sendMessage(msg.key.remoteJid, { video: buffer, caption: 'Opened view-once 👀' });
            } else if (inner.audioMessage) {
                console.log('📤 Sending audio...');
                await sock.sendMessage(msg.key.remoteJid, { audio: buffer, mimetype: inner.audioMessage.mimetype || 'audio/mpeg', ptt: false, fileName: 'audio' });
            } else {
                console.log('❌ Unsupported media type');
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Unsupported view-once media type` });
            }
        } catch (error) {
            console.error('❌ VV Error:', error);
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to open view-once: ${error.message}` });
        }
    });

    registerCommand('vv2', 'Open view-once and send to your DM', async (sock, msg) => {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        let dmJid = jidNormalizedUser(senderJid);
        if ((senderJid || '').includes(normalizedOwner) || msg.key.fromMe) {
            let target = null;
            if ((msg.key.remoteJid || '').endsWith('@g.us')) {
                try {
                    const meta = await sock.groupMetadata(msg.key.remoteJid);
                    const match = (meta.participants || []).find(p => (p.id || '').includes(normalizedOwner));
                    if (match) target = match.id;
                } catch {}
            }
            dmJid = jidNormalizedUser(target || `${normalizedOwner}@s.whatsapp.net`);
        }

        let contextInfo = null;
        const m = msg.message;
        if (m.extendedTextMessage?.contextInfo) { contextInfo = m.extendedTextMessage.contextInfo; }
        const quotedMsg = getQuotedMessage(msg);
        if (!quotedMsg) { await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please reply to a view-once message with ${config.prefix}vv2` }); return; }
        let checkMsg = quotedMsg;
        if (checkMsg.ephemeralMessage) { checkMsg = checkMsg.ephemeralMessage.message; }
        let hasViewOnce = checkMsg.viewOnceMessage || checkMsg.viewOnceMessageV2 || checkMsg.viewOnceMessageV2Extension;
        if (!hasViewOnce && contextInfo) { hasViewOnce = contextInfo.isViewOnce === true || contextInfo.isViewOnce === 1 || (contextInfo.quotedMessage && (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage)); }
        const isQuotedMedia = !!(quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage);
        if (!hasViewOnce && !isQuotedMedia) { await sock.sendMessage(msg.key.remoteJid, { text: `❌ That's not a view-once message!` }); return; }
        let inner = unwrapViewOnce(quotedMsg);
        if (!inner && (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage)) { inner = quotedMsg; }
        if (!inner) { await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to unwrap view-once message` }); return; }
        try {
            const buffer = await downloadMediaMessage({ message: inner }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
            if (inner.imageMessage) { await sock.sendMessage(dmJid, { image: buffer, caption: 'Opened view-once 👀' }); }
            else if (inner.videoMessage) { await sock.sendMessage(dmJid, { video: buffer, caption: 'Opened view-once 👀' }); }
            else if (inner.audioMessage) { await sock.sendMessage(dmJid, { audio: buffer, mimetype: inner.audioMessage.mimetype || 'audio/mpeg', ptt: false, fileName: 'audio' }); }
            else { await sock.sendMessage(msg.key.remoteJid, { text: `❌ Unsupported view-once media type` }); return; }
            await sock.sendMessage(msg.key.remoteJid, { text: '✅ Sent to your DM' });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to process view-once: ${error.message}` });
        }
    });

    registerCommand('del', 'Delete the replied message', async (sock, msg) => {
        const chatId = msg.key.remoteJid;
        const m = msg.message || {};
        const ctx = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || m.documentMessage?.contextInfo || m.audioMessage?.contextInfo || m.stickerMessage?.contextInfo || null;
        const stanzaId = ctx?.stanzaId;
        const participant = ctx?.participant;
        if (!stanzaId) {
            await sock.sendMessage(chatId, { text: `❌ Reply to a message with ${config.prefix}del` });
            return;
        }
        const delKey = { remoteJid: chatId, id: stanzaId };
        if (participant) delKey.participant = participant;
        try {
            await sock.sendMessage(chatId, { delete: delKey });
        } catch (error) {
            await sock.sendMessage(chatId, { text: `❌ Failed to delete: ${error.message}` });
        }
    });

    registerCommand('save', 'Save replied status media/text to your chat', async (sock, msg) => {
        await saveStatus(sock, msg);
    });

    registerCommand('sticker', 'Convert replied image to sticker or GIF for short videos', async (sock, msg) => {
        const chatId = msg.key.remoteJid;
        const m = msg.message || {};
        const quotedMsg = getQuotedMessage(msg);
        if (!quotedMsg) {
            await sock.sendMessage(chatId, { text: `❌ Reply to an image with ${config.prefix}sticker` });
            return;
        }
        let q = quotedMsg;
        if (q.ephemeralMessage) q = q.ephemeralMessage.message;
        try {
            if (q.videoMessage) {
                try {
                    const buffer = await downloadMediaMessage({ message: quotedMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const mp4Gif = await gifFeature.convertVideoToGif(buffer, { maxSeconds: 8, watermarkText: CHANNEL_URL });
                    await sock.sendMessage(chatId, { video: mp4Gif, gifPlayback: true, mimetype: 'video/mp4', caption: 'GIF', ...CHANNEL_CONTEXT });
                } catch (e) {
                    await sock.sendMessage(chatId, { text: `❌ Failed to create GIF: ${e.message}\n\n${CHANNEL_URL}`, ...CHANNEL_CONTEXT });
                }
                return;
            }
            if (q.imageMessage) {
            const buffer = await downloadMediaMessage({ message: quotedMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
            const stickerBuffer = await createStickerBuffer(buffer, 'FIAZZY-MD', 'fiazzypaul');
            await sock.sendMessage(chatId, { sticker: stickerBuffer });
                return;
            }
            await sock.sendMessage(chatId, { text: `❌ Reply to an image or short video\n\n${CHANNEL_URL}`, ...CHANNEL_CONTEXT });
        } catch (error) {
            await sock.sendMessage(chatId, { text: `❌ Failed to process media: ${error.message}\n\n${CHANNEL_URL}`, ...CHANNEL_CONTEXT });
        }
    });

    registerCommand('s', 'Alias for sticker', async (sock, msg, args) => {
        const handler = commands.get('sticker');
        if (handler) return handler(sock, msg, args);
    });

    // Register simage command (sticker to image/video converter)
    registerCommand('simage', 'Convert sticker to image or animated sticker to video', async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const quotedMsg = getQuotedMessage(msg);

        if (!quotedMsg) {
            await sock.sendMessage(chatId, { text: `❌ Reply to a sticker with ${config.prefix}simage to convert it!` });
            return;
        }

        let q = quotedMsg;
        if (q.ephemeralMessage) q = q.ephemeralMessage.message;

        await convertStickerToImage(sock, q, chatId);
    });

    // welcome moved to features/group.js

    registerCommand('antidelete', 'Toggle anti-delete globally (saved in .env)', async (sock, msg, args) => {
        const arg = (args[0] || '').toLowerCase();
        if (arg === 'on') {
            const success = updateEnvFile('AUTO_ANTI_DELETE', 'true');
            if (success) {
                process.env.AUTO_ANTI_DELETE = 'true';
                antiDeleteChats.set('global', true);
                await sock.sendMessage(msg.key.remoteJid, { text: '✅ Anti-delete enabled globally\n\n💡 This setting is saved to .env and will persist after restart' });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to update .env file' });
            }
        } else if (arg === 'off') {
            const success = updateEnvFile('AUTO_ANTI_DELETE', 'false');
            if (success) {
                process.env.AUTO_ANTI_DELETE = 'false';
                antiDeleteChats.clear();
                await sock.sendMessage(msg.key.remoteJid, { text: '✅ Anti-delete disabled globally\n\n💡 This setting is saved to .env' });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to update .env file' });
            }
        } else {
            const enabled = process.env.AUTO_ANTI_DELETE === 'true' || antiDeleteChats.get('global');
            await sock.sendMessage(msg.key.remoteJid, { text: `📊 Anti-delete is ${enabled ? 'ON' : 'OFF'} (Global)\n\nUse ${config.prefix}antidelete on/off\n\n💡 This is a global setting saved in .env` });
        }
    });

    registerCommand('block', 'Block user in DM', async (sock, msg) => {
        if (Permissions.isGroup(msg.key.remoteJid)) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for DMs!' });
            return;
        }
        try {
            await sock.sendMessage(msg.key.remoteJid, { text: '⛔ Blocking this chat...' });
            await sock.updateBlockStatus(msg.key.remoteJid, 'block');
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to block: ${error.message}` });
        }
    });

    registerCommand('autoviewonce', 'Toggle auto-open of view-once media globally', async (sock, msg, args) => {
        const arg = (args[0] || '').toLowerCase();
        if (arg === 'on') {
            const success = updateEnvFile('AUTO_VIEW_ONCE', 'true');
            if (success) {
                process.env.AUTO_VIEW_ONCE = 'true';
                // Enable for all chats
                autoViewOnceChats.add('global');
                await sock.sendMessage(msg.key.remoteJid, { text: '✅ Auto view-once enabled globally\n\n💡 This setting is saved to .env and will persist after restart' });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to update .env file' });
            }
        } else if (arg === 'off') {
            const success = updateEnvFile('AUTO_VIEW_ONCE', 'false');
            if (success) {
                process.env.AUTO_VIEW_ONCE = 'false';
                autoViewOnceChats.clear();
                await sock.sendMessage(msg.key.remoteJid, { text: '✅ Auto view-once disabled globally\n\n💡 This setting is saved to .env' });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to update .env file' });
            }
        } else {
            const enabled = process.env.AUTO_VIEW_ONCE === 'true';
            await sock.sendMessage(msg.key.remoteJid, { text: `📊 Auto view-once is ${enabled ? 'ON' : 'OFF'} (Global)\n\nUse ${config.prefix}autoviewonce on/off\n\n💡 This is a global setting saved in .env` });
        }
    });

    registerCommand('setvar', 'Set environment variable in .env file', async (sock, msg, args) => {
        if (args.length < 2) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📖 *How to use ${config.prefix}setvar*\n\n` +
                      `*Description:* Set or update environment variables\n\n` +
                      `*Usage:* ${config.prefix}setvar <KEY> <VALUE>\n\n` +
                      `*Common Variables:*\n` +
                      `• BOT_MODE (alias: mode) - public/private\n` +
                      `• PREFIX - Command prefix\n` +
                      `• OWNER_NUMBER (alias: owner) - Owner number\n` +
                      `• BOT_NAME (alias: name) - Bot name\n` +
                      `• AUTO_VIEW_ONCE (alias: viewonce) - true/false\n` +
                      `• AUTO_ANTI_DELETE (alias: antidelete) - true/false\n` +
                      `• TMDB_API_KEY (alias: tmdb) - TMDb API key\n\n` +
                      `*Examples:*\n` +
                      `${config.prefix}setvar mode private\n` +
                      `${config.prefix}setvar BOT_MODE public\n` +
                      `${config.prefix}setvar PREFIX !\n` +
                      `${config.prefix}setvar owner 2349012345678\n` +
                      `${config.prefix}setvar tmdb <API_KEY>\n\n` +
                      `💡 *Tip:* Use shortcut commands like ${config.prefix}mode, ${config.prefix}prefix instead!`
            });
            return;
        }

        let key = args[0].toUpperCase();
        const value = args.slice(1).join(' ');

        // Map common aliases to actual env variable names
        const keyAliases = {
            'MODE': 'BOT_MODE',
            'BOTMODE': 'BOT_MODE',
            'OWNERNUMBER': 'OWNER_NUMBER',
            'OWNER': 'OWNER_NUMBER',
            'BOTNAME': 'BOT_NAME',
            'NAME': 'BOT_NAME',
            'AUTOVIEWONCE': 'AUTO_VIEW_ONCE',
            'VIEWONCE': 'AUTO_VIEW_ONCE',
            'GEMINI': 'GEMINI_API_KEY',
            'PRESENCE': 'WAPRESENCE_STATE',
            'WAPRESENCE': 'WAPRESENCE_STATE',
            'OPENAI': 'OPENAI_API_KEY',
            'CHATGPT': 'OPENAI_API_KEY',
            'GPT': 'OPENAI_API_KEY',
            'CLOUDFLARE_ACCOUNT': 'CF_ACCOUNT_ID',
            'CF_ACCOUNT': 'CF_ACCOUNT_ID',
            'CF_MODEL': 'CF_IMAGE_MODEL',
            'TMDB': 'TMDB_API_KEY'
        };

        // Use alias mapping if exists
        if (keyAliases[key]) {
            key = keyAliases[key];
        }

        // Validate common variables
        if (key === 'BOT_MODE' && !['public', 'private'].includes(value.toLowerCase())) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Invalid BOT_MODE value!\n\n` +
                      `Valid values: public, private\n\n` +
                      `Example: ${config.prefix}setvar BOT_MODE public`
            });
            return;
        }

        if (key === 'AUTO_VIEW_ONCE' && !['true', 'false'].includes(value.toLowerCase())) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Invalid AUTO_VIEW_ONCE value!\n\n` +
                      `Valid values: true, false\n\n` +
                      `Example: ${config.prefix}setvar AUTO_VIEW_ONCE true`
            });
            return;
        }

        // Presence: validate and set canonical state
        if (key === 'WAPRESENCE_STATE') {
            const mapped = presence.mapInputToState(value);
            if (!mapped) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `❌ Invalid presence value!\n\nValid values: on, off, typing, recording, online\n\nExample: ${config.prefix}setvar presence typing`
                });
                return;
            }
            const ok = updateEnvFile('WAPRESENCE_STATE', mapped);
            if (ok) {
                process.env.WAPRESENCE_STATE = mapped;
                try {
                    await sock.sendPresenceUpdate(mapped, msg.key.remoteJid);
                    if (mapped === 'available') { await sock.sendPresenceUpdate('available'); }
                } catch {}
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `✅ *Presence Updated Successfully!*\n\n• State: ${mapped.toUpperCase()}\n\nApplies globally.`
                });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to update presence in .env' });
            }
            return;
        }

        // Update .env file
        const success = updateEnvFile(key, value);

        if (success) {
            // Update runtime config for immediate effect (where applicable)
            process.env[key] = value;

            if (key === 'BOT_MODE') {
                config.botMode = value.toLowerCase();
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `✅ *Variable Updated Successfully!*\n\n` +
                          `• Key: ${key}\n` +
                          `• Value: ${value}\n\n` +
                          `📝 Bot mode changed to: *${value.toUpperCase()}*\n\n` +
                          `💡 Change is active immediately!`
                });
            } else if (key === 'PREFIX') {
                // Update config for immediate effect
                config.prefix = value;
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `✅ *Variable Updated Successfully!*\n\n` +
                          `• Key: ${key}\n` +
                          `• Value: ${value}\n\n` +
                          `💡 *Change is active immediately!*\n` +
                          `Try it: ${value}ping`
                });
            } else if (key === 'OWNER_NUMBER') {
                config.ownerNumber = value;
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `✅ *Variable Updated Successfully!*\n\n` +
                          `• Key: ${key}\n` +
                          `• Value: ${value}\n\n` +
                          `⚠️ *Restart Required:* Please restart the bot for owner number change to take effect`
                });
            } else if (key === 'BOT_NAME') {
                config.botName = value;
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `✅ *Variable Updated Successfully!*\n\n` +
                          `• Key: ${key}\n` +
                          `• Value: ${value}\n\n` +
                          `💡 Bot name changed to: *${value}*`
                });
            } else if (key === 'AUTO_VIEW_ONCE') {
                if (value.toLowerCase() === 'true') {
                    autoViewOnceChats.add('global');
                } else {
                    autoViewOnceChats.clear();
                }
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `✅ *Variable Updated Successfully!*\n\n` +
                          `• Key: ${key}\n` +
                          `• Value: ${value}\n\n` +
                          `💡 Auto view-once is now: *${value.toLowerCase() === 'true' ? 'ON' : 'OFF'}*`
                });
            } else if (key === 'GEMINI_API_KEY') {
                const ok = gemini.initializeGemini();
                await sock.sendMessage(msg.key.remoteJid, { text: ok ? '✅ Gemini API initialized.' : '⚠️ API set. Restart may be required for stability.' });
            } else {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `✅ *Variable Updated Successfully!*\n\n` +
                          `• Key: ${key}\n` +
                          `• Value: ${value}\n\n` +
                          `💡 Saved to .env file\n` +
                          `⚠️ Some changes may require bot restart`
                });
            }
        } else {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to update .env file!\n\n` +
                      `Please check file permissions and try again.`
            });
        }
    });

    // Command to view all environment variables
    registerCommand('seevar', 'View all environment variables', async (sock, msg) => {
        const autoViewOnce = process.env.AUTO_VIEW_ONCE === 'true';

        const varsText = `╭────────────────────────╮
│  📊 *ENVIRONMENT VARS*  │
╰────────────────────────╯

🤖 *Bot Configuration:*
• Mode: ${config.botMode.toUpperCase()} ${config.botMode === 'private' ? '🔒' : '🌐'}
• Prefix: ${config.prefix}
• Name: ${config.botName}
• Version: ${config.botVersion}

👤 *Owner:*
• Number: ${config.ownerNumber}

⚙️ *Features:*
• Auto View-Once: ${autoViewOnce ? 'ON ✅' : 'OFF ❌'}

📝 *Quick Commands:*
${config.prefix}mode <public|private>
${config.prefix}prefix <symbol>
${config.prefix}ownernumber <number>
${config.prefix}setvar <key> <value>

💡 Use ${config.prefix}help <command> for details`;

        await sock.sendMessage(msg.key.remoteJid, { text: varsText });
    });

    // Shortcut command for mode
    registerCommand('mode', 'Change bot mode (public/private)', async (sock, msg, args) => {
        if (args.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📊 *Current Mode:* ${config.botMode.toUpperCase()}\n\n` +
                      `*Usage:* ${config.prefix}mode <public|private>\n\n` +
                      `*Examples:*\n` +
                      `${config.prefix}mode public\n` +
                      `${config.prefix}mode private`
            });
            return;
        }

        const mode = args[0].toLowerCase();
        if (!['public', 'private'].includes(mode)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Invalid mode!\n\n` +
                      `Valid modes: public, private\n\n` +
                      `*Usage:* ${config.prefix}mode <public|private>`
            });
            return;
        }

        const success = updateEnvFile('BOT_MODE', mode);
        if (success) {
            config.botMode = mode;
            process.env.BOT_MODE = mode;
            await sock.sendMessage(msg.key.remoteJid, {
                text: `✅ *Bot Mode Changed!*\n\n` +
                      `• New Mode: *${mode.toUpperCase()}*\n\n` +
                      `${mode === 'private' ? '🔒 Only bot owner can use commands' : '🌐 Everyone can use commands'}\n\n` +
                      `💡 Change is active immediately!`
            });
        } else {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to update mode!`
            });
        }
    });

    // Shortcut command for prefix
    registerCommand('prefix', 'Change bot command prefix', async (sock, msg, args) => {
        if (args.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📊 *Current Prefix:* ${config.prefix}\n\n` +
                      `*Usage:* ${config.prefix}prefix <symbol>\n\n` +
                      `*Examples:*\n` +
                      `${config.prefix}prefix .\n` +
                      `${config.prefix}prefix !\n` +
                      `${config.prefix}prefix #\n\n` +
                      `💡 Only symbols allowed`
            });
            return;
        }

        const newPrefix = args[0];

        // Validate that it's a symbol (not alphanumeric)
        if (/^[a-zA-Z0-9]+$/.test(newPrefix)) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Invalid prefix!\n\n` +
                      `Prefix must be a symbol (not letters or numbers)\n\n` +
                      `*Valid examples:* . ! # $ % & * + - / @ ~ \n` +
                      `*Invalid:* a b c 1 2 3`
            });
            return;
        }

        const oldPrefix = config.prefix;
        const success = updateEnvFile('PREFIX', newPrefix);
        if (success) {
            // Update both config and process.env for immediate effect
            config.prefix = newPrefix;
            process.env.PREFIX = newPrefix;

            await sock.sendMessage(msg.key.remoteJid, {
                text: `✅ *Prefix Changed Successfully!*\n\n` +
                      `• Old Prefix: ${oldPrefix}\n` +
                      `• New Prefix: ${newPrefix}\n\n` +
                      `💡 *Change is active immediately!*\n` +
                      `Try it: ${newPrefix}ping`
            });
        } else {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to update prefix!`
            });
        }
    });

    // Shortcut command for owner number
    registerCommand('ownernumber', 'Set bot owner number', async (sock, msg, args) => {
        if (args.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📊 *Current Owner:* ${config.ownerNumber}\n\n` +
                      `*Usage:* ${config.prefix}ownernumber <number>\n\n` +
                      `*Example:*\n` +
                      `${config.prefix}ownernumber 2349012345678\n\n` +
                      `💡 Use country code without + or spaces`
            });
            return;
        }

        const newOwner = args[0].replace(/[^0-9]/g, '');
        if (!newOwner || newOwner.length < 10) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Invalid phone number!\n\n` +
                      `*Usage:* ${config.prefix}ownernumber <number>\n` +
                      `Example: ${config.prefix}ownernumber 2349012345678`
            });
            return;
        }

        const success = updateEnvFile('OWNER_NUMBER', newOwner);
        if (success) {
            config.ownerNumber = newOwner;
            process.env.OWNER_NUMBER = newOwner;
            await sock.sendMessage(msg.key.remoteJid, {
                text: `✅ *Owner Number Changed!*\n\n` +
                      `• New Owner: ${newOwner}\n\n` +
                      `⚠️ *Restart Required:* Please restart the bot for the change to take effect`
            });
        } else {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to update owner number!`
            });
        }
    });

    // Song Download Command
    registerCommand('song', 'Search and download songs', async (sock, msg, args) => {
        if (args.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `🎵 *SONG DOWNLOADER*\n\n` +
                      `*Usage:* ${config.prefix}song <song name>\n\n` +
                      `*Example:*\n` +
                      `${config.prefix}song Faded\n\n` +
                      `💡 After search, reply with 1 to download or 2 to cancel`
            });
            return;
        }

        const query = args.join(' ');
        const userId = msg.key.participant || msg.key.remoteJid;
        const chatId = msg.key.remoteJid;

        try {
            await sock.sendMessage(chatId, {
                text: `🔍 Searching for: *${query}*\n\n⏳ Please wait...`
            });

            const result = await songs.searchSong(query);

            const storageKeySong = `${chatId}:${userId}`;
            songs.storeSearchSession(storageKeySong, result);

            // Send thumbnail with options
            await sock.sendMessage(chatId, {
                image: { url: result.thumbnail },
                caption: songs.formatSearchResult(result)
            }, { quoted: msg });

        } catch (error) {
            console.error('❌ Song search error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to search for song!\n\n` +
                      `Error: ${error.message}\n\n` +
                      `💡 Please try again later`
            });
        }
    });

    registerCommand('songs', 'Alias for song', async (sock, msg, args) => {
        const h = commands.get('song');
        if (h && h.handler) return h.handler(sock, msg, args);
    });

    // YouTube Video Download Command
    registerCommand('ytvideo', 'Search and download videos from YouTube', async (sock, msg, args) => {
        if (args.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `🎬 *YOUTUBE VIDEO DOWNLOADER*\n\n` +
                      `*Usage:* ${config.prefix}ytvideo <search query or YouTube URL>\n\n` +
                      `💡 After search, reply with a number (1-10) to download as MP4`
            });
            return;
        }

        const query = args.join(' ');
        const userId = msg.key.participant || msg.key.remoteJid;
        const chatId = msg.key.remoteJid;

        try {
            // Check if it's a YouTube URL
            if (youtube.isYTUrl(query)) {
                await sock.sendMessage(chatId, { text: `🎬 *DOWNLOADING MP4*\n\nDownloading this video at best available quality` });

                const downloadData = await ytvideo.getMp4DownloadUrl(query);
                const videoFile = await ytvideo.downloadFile(downloadData.url, downloadData.title || 'YouTube Video', '.mp4');

                await sock.sendMessage(chatId, {
                    video: { url: videoFile.filePath },
                    mimetype: 'video/mp4',
                    fileName: `${videoFile.title}.mp4`,
                    caption: `✅ *Download Complete!*\n\n🎬 ${videoFile.title}`
                }, { quoted: msg });

                await videoFile.cleanup();
                return;
            }

            // Otherwise treat as search
            await sock.sendMessage(chatId, { text: `🔍 Searching for: *${query}*\n\n⏳ Please wait...` });
            const results = await ytvideo.searchYouTube(query);

            if (!results || results.length === 0) {
                await sock.sendMessage(chatId, { text: `❌ No results found for: *${query}*` });
                return;
            }

            const storageKeyVid = `${chatId}:${userId}`;
            ytvideo.storeSearchSession(storageKeyVid, results);

            const resultsText = ytvideo.formatSearchResults(results, query);
            await sock.sendMessage(chatId, { text: resultsText }, { quoted: msg });

        } catch (error) {
            console.error('❌ YouTube search/download error:', error);
            await sock.sendMessage(chatId, { text: `❌ Error: ${error.message}` });
        }
    });

    // Register TikTok downloader command
    registerCommand('tiktok', 'Download TikTok videos or images', async (sock, msg, args) => {
        const url = args.join(' ');
        await tiktokDownloader(sock, msg, url);
    });

    // Register MP3 extraction command
    registerCommand('mp3', 'Extract audio from video as MP3', async (sock, msg, args) => {
        await extractAudioToMp3(sock, msg);
    });

    // Register reverse media command
    registerCommand('reverse', 'Reverse audio or video', async (sock, msg, args) => {
        await reverseMedia(sock, msg);
    });

    // Register Audio Editor commands (.bass, .speed)
    registerCommand('bass', 'Increase bass (e.g., .bass 20 or .bass 20%)', async (sock, msg, args) => {
        await bass(sock, msg, args);
    });

    registerCommand('speed', 'Change audio speed (e.g., 1.5x, 2x, 0.5x)', async (sock, msg, args) => {
        await speed(sock, msg, args);
    });

    registerCommand('cut', 'Cut audio (e.g., .cut 1.0,1.30)', async (sock, msg, args) => {
        await cut(sock, msg, args);
    });

    // Register Text Maker commands
    registerCommand('metallic', 'Generate 3D metal text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'metallic');
    });

    registerCommand('fire', 'Generate flame text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'fire');
    });

    registerCommand('neon', 'Generate neon light text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'neon');
    });

    registerCommand('glitch', 'Generate digital glitch text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'glitch');
    });

    registerCommand('matrix', 'Generate matrix style text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'matrix');
    });

    registerCommand('luxurygold', 'Generate luxury gold text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'luxurygold');
    });

    registerCommand('chrome', 'Generate glossy chrome text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'chrome');
    });

    registerCommand('thunder', 'Generate thunder text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'thunder');
    });

    registerCommand('ice', 'Generate ice text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'ice');
    });

    registerCommand('snow', 'Generate snow 3D text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'snow');
    });

    registerCommand('purple', 'Generate purple text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'purple');
    });

    registerCommand('devil', 'Generate neon devil wings text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'devil');
    });

    registerCommand('hacker', 'Generate anonymous hacker text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'hacker');
    });

    registerCommand('light', 'Generate futuristic light text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'light');
    });

    registerCommand('impressive', 'Generate colorful paint text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'impressive');
    });

    registerCommand('leaves', 'Generate green brush text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'leaves');
    });

    registerCommand('sand', 'Generate text on sand effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'sand');
    });

    registerCommand('blackpink', 'Generate BLACKPINK style text', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'blackpink');
    });

    registerCommand('1917', 'Generate 1917 style text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, '1917');
    });

    registerCommand('arena', 'Generate Arena of Valor style text', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'arena');
    });

    registerCommand('wings', 'Generate wings text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'wings');
    });

    registerCommand('christmas1', 'Generate sparkles 3D Christmas text', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'christmas1');
    });

    registerCommand('christmas2', 'Generate Christmas video card style', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'christmas2');
    });

    registerCommand('frost', 'Generate frozen Christmas text', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'frost');
    });

    registerCommand('deadpool', 'Generate Deadpool logo style text', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'deadpool');
    });

    registerCommand('dbz', 'Generate Dragon Ball Z style text', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'dbz');
    });

    registerCommand('naruto', 'Generate Naruto Shippuden style text', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'naruto');
    });

    registerCommand('pixelglitch', 'Generate pixel glitch text effect', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'pixelglitch');
    });

    registerCommand('arrow', 'Generate multicolored arrow signature', async (sock, msg, args) => {
        const text = args.join(' ');
        await textmaker(sock, msg, text, 'arrow');
    });

    // Register Trivia command
    registerCommand('trivia', 'Play trivia quiz game', async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const difficulty = args[0]; // optional: easy, medium, hard

        try {
            // Check if user wants to see categories/help
            if (difficulty === 'help' || difficulty === 'categories') {
                const helpMessage = trivia.getCategories();
                await sock.sendMessage(chatId, { text: helpMessage });
                return;
            }

            // Start a new trivia question
            const triviaMessage = await trivia.startTrivia(chatId, difficulty);

            if (triviaMessage) {
                await sock.sendMessage(chatId, { text: triviaMessage });
            }
        } catch (error) {
            console.error('Trivia error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to start trivia!\n\nError: ${error.message}\n\n💡 Try again with \`${config.prefix}trivia\``
            });
        }
    });

    // Register Weather command
    registerCommand('weather', 'Get current weather for a city', async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const city = args.join(' ');

        if (!city || city.trim().length === 0) {
            await sock.sendMessage(chatId, {
                text: `🌤️ *WEATHER COMMAND*\n\n` +
                      `*Usage:* ${config.prefix}weather <city name>\n\n` +
                      `*Examples:*\n` +
                      `${config.prefix}weather London\n` +
                      `${config.prefix}weather New York\n` +
                      `${config.prefix}weather Tokyo,JP\n\n` +
                      `💡 You can specify country code for accuracy:\n` +
                      `${config.prefix}weather Paris,FR`
            });
            return;
        }

        try {
            await sock.sendMessage(chatId, {
                text: `🌤️ Fetching weather data for *${city}*...\n\n⏳ Please wait...`
            });

            const weatherData = await weather.getWeather(city);
            const weatherMessage = weather.formatWeather(weatherData);

            await sock.sendMessage(chatId, { text: weatherMessage }, { quoted: msg });
        } catch (error) {
            console.error('Weather error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to fetch weather!\n\n` +
                      `Error: ${error.message}\n\n` +
                      `💡 Make sure the city name is correct\n` +
                      `Example: ${config.prefix}weather London`
            });
        }
    });

    // Register Forecast command
    registerCommand('forecast', 'Get 5-day weather forecast for a city', async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const city = args.join(' ');

        if (!city || city.trim().length === 0) {
            await sock.sendMessage(chatId, {
                text: `📅 *FORECAST COMMAND*\n\n` +
                      `*Usage:* ${config.prefix}forecast <city name>\n\n` +
                      `*Examples:*\n` +
                      `${config.prefix}forecast London\n` +
                      `${config.prefix}forecast New York\n` +
                      `${config.prefix}forecast Tokyo,JP`
            });
            return;
        }

        try {
            await sock.sendMessage(chatId, {
                text: `📅 Fetching 5-day forecast for *${city}*...\n\n⏳ Please wait...`
            });

            const forecastData = await weather.getForecast(city);
            const forecastMessage = weather.formatForecast(forecastData);

            await sock.sendMessage(chatId, { text: forecastMessage }, { quoted: msg });
        } catch (error) {
            console.error('Forecast error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to fetch forecast!\n\n` +
                      `Error: ${error.message}\n\n` +
                      `💡 Make sure the city name is correct\n` +
                      `Example: ${config.prefix}forecast London`
            });
        }
    });

    /* moved to features/group.js */
    /* registerCommand('mute', 'Mute the group', async (sock, msg, args) => {
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Robust owner detection (handles LIDs and self messages)
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;

        // Check if user is admin (owner can bypass in any mode)
        if (!isOwner) {
            if (config.botMode === 'private') {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ This command is restricted to bot owner in private mode!'
                });
            }

            if (!(await isUserAdmin(sock, msg.key.remoteJid, msg.key.participant))) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Only admins can use this command!'
                });
            }
        }

        try {
            // Parse minutes if provided
            const minutes = args.length > 0 ? parseInt(args[0]) : 0;

            if (args.length > 0 && (isNaN(minutes) || minutes <= 0)) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: `📖 *How to use ${config.prefix}mute*\n\n` +
                          `*Description:* Mute the group\n\n` +
                          `*Usage:*\n` +
                          `• ${config.prefix}mute - Mute indefinitely\n` +
                          `• ${config.prefix}mute <minutes> - Mute for specified time\n\n` +
                          `*Examples:*\n` +
                          `1. ${config.prefix}mute\n` +
                          `2. ${config.prefix}mute 30 (mutes for 30 minutes)`
                });
            }

            // Mute the group (only admins can send messages)
            await sock.groupSettingUpdate(msg.key.remoteJid, 'announcement');

            // Clear any existing timer for this group
            if (muteTimers.has(msg.key.remoteJid)) {
                clearTimeout(muteTimers.get(msg.key.remoteJid));
                muteTimers.delete(msg.key.remoteJid);
            }

            if (minutes > 0) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `🔇 *Group Muted*\n\n⏰ Duration: ${minutes} minute${minutes === 1 ? '' : 's'}\n\nOnly admins can send messages.`
                });

                // Set auto-unmute timer
                const timer = setTimeout(async () => {
                    try {
                        await sock.groupSettingUpdate(msg.key.remoteJid, 'not_announcement');
                        await sock.sendMessage(msg.key.remoteJid, {
                            text: `🔊 *Group Auto-Unmuted*\n\nEveryone can send messages again!`
                        });
                        muteTimers.delete(msg.key.remoteJid);
                    } catch (error) {
                        console.error('Auto-unmute failed:', error);
                        muteTimers.delete(msg.key.remoteJid);
                    }
                }, minutes * 60 * 1000);

                muteTimers.set(msg.key.remoteJid, timer);
            } else {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `🔇 *Group Muted*\n\nOnly admins can send messages.\nUse ${config.prefix}unmute to unmute.`
                });
            }
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to mute group: ${error.message}`
            });
        }
    }); */

    /* moved to features/group.js */
    /* registerCommand('unmute', 'Unmute the group', async (sock, msg) => {
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Robust owner detection (handles LIDs and self messages)
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;

        // Check if user is admin (owner can bypass in any mode)
        if (!isOwner) {
            if (config.botMode === 'private') {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ This command is restricted to bot owner in private mode!'
                });
            }

            if (!(await isUserAdmin(sock, msg.key.remoteJid, msg.key.participant))) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Only admins can use this command!'
                });
            }
        }

        try {
            // Clear any existing auto-unmute timer
            if (muteTimers.has(msg.key.remoteJid)) {
                clearTimeout(muteTimers.get(msg.key.remoteJid));
                muteTimers.delete(msg.key.remoteJid);
            }

            // Unmute the group
            await sock.groupSettingUpdate(msg.key.remoteJid, 'not_announcement');

            await sock.sendMessage(msg.key.remoteJid, {
                text: `🔊 *Group Unmuted*\n\nEveryone can send messages again!`
            });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to unmute group: ${error.message}`
            });
        }
    }); */

    /* moved to features/group.js */
    /* registerCommand('warn', 'Warn a user in the group', async (sock, msg, args) => {
        if (!Permissions.isGroup(msg.key.remoteJid)) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' });
            return;
        }
        let targetJid = null;
        if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
            targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (args[0]) {
            const num = args[0].replace(/[^0-9]/g, '');
            if (num) targetJid = `${num}@s.whatsapp.net`;
        }
        if (!targetJid) {
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Specify a user to warn (reply or mention)` });
            return;
        }
        const limit = warnLimits.get(msg.key.remoteJid) || 3;
        const groupMap = warnCounts.get(msg.key.remoteJid) || new Map();
        const c = (groupMap.get(targetJid) || 0) + 1;
        groupMap.set(targetJid, c);
        warnCounts.set(msg.key.remoteJid, groupMap);
        if (c >= limit) {
            try {
                await sock.groupParticipantsUpdate(msg.key.remoteJid, [targetJid], 'remove');
                await sock.sendMessage(msg.key.remoteJid, { text: `⛔ Warn limit reached. Kicked @${targetJid.split('@')[0]}`, mentions: [targetJid] });
            } catch (e) {
                await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ Failed to kick: ${e.message}` });
            }
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ Warned @${targetJid.split('@')[0]} (${c}/${limit})`, mentions: [targetJid] });
        }
    }); */

    /* moved to features/group.js */
    /* registerCommand('resetwarn', 'Reset warnings for a user', async (sock, msg, args) => {
        if (!Permissions.isGroup(msg.key.remoteJid)) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' });
            return;
        }
        let targetJid = null;
        if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
            targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (args[0]) {
            const num = args[0].replace(/[^0-9]/g, '');
            if (num) targetJid = `${num}@s.whatsapp.net`;
        }
        if (!targetJid) {
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Reply to a message or mention a user to reset their warnings` });
            return;
        }
        const groupMap = warnCounts.get(msg.key.remoteJid) || new Map();
        const prevCount = groupMap.get(targetJid) || 0;
        groupMap.delete(targetJid);
        warnCounts.set(msg.key.remoteJid, groupMap);
        await sock.sendMessage(msg.key.remoteJid, {
            text: `✅ Reset warnings for @${targetJid.split('@')[0]} (had ${prevCount} warnings)`,
            mentions: [targetJid]
        });
    }); */

    registerCommand('ping', 'Check bot response time', async (sock, msg) => {
        const start = Date.now();
        const sentMsg = await sock.sendMessage(msg.key.remoteJid, {
            text: '🏓 Pinging...'
        });
        const end = Date.now();
        const ping = end - start;

        await sock.sendMessage(msg.key.remoteJid, {
            text: `🏓 *Pong!*\n\n⚡ Response Time: ${ping}ms\n📊 Speed: ${ping < 100 ? 'Excellent' : ping < 300 ? 'Good' : 'Fair'}`
        }, { quoted: sentMsg });
    });

    registerHelpCommand({ sock, config, commands, registerCommand, CHANNEL_CONTEXT });
    registerOwnerCommands({ registerCommand, sock, config });
    registerMemeCommands({ registerCommand, sock, config });

    registerCommand('session', 'View current session info', async (sock, msg) => {
        await sock.sendMessage(msg.key.remoteJid, {
            text: `📊 *Session Information*\n\n` +
                  `• Session: ${sessionManager.currentSession}\n` +
                  `• Device: ${sock.user.name || config.botName}\n` +
                  `• Number: ${sock.user.id.split(':')[0]}\n` +
                  `• Mode: ${config.botMode.toUpperCase()}\n` +
                  `• Status: Active ✅`
        });
    });

    registerCommand('repo', 'Show bot repository link and creator info', async (sock, msg) => {
        const text = `📦 *FiazzyMD Repository*\n\n` +
                     `🔗 https://github.com/fiazzypaul/fiazzymd.git\n\n` +
                     `👤 Made by *fiazzypaul*\n` +
                     `📞 Creator: 2349019151146\n\n` +
                     `✨ Star the repo and share!`;
        await sock.sendMessage(msg.key.remoteJid, { text });
    });

    registerCommand('img', 'Generate image from text using Cloudflare Workers AI', async (sock, msg, args) => {
        const prompt = args.join(' ').trim();
        const jid = msg.key.remoteJid;
        if (!prompt) { await sock.sendMessage(jid, { text: `💡 Usage: ${config.prefix}img <prompt>\nExample: ${config.prefix}img a futuristic city skyline at night` }); return; }
        if (!process.env.CF_ACCOUNT_ID && !process.env.CLOUDFLARE_ACCOUNT) { await sock.sendMessage(jid, { text: `❌ Cloudflare account not set. Use ${config.prefix}setvar CF_ACCOUNT_ID <ID>` }); return; }
        if (!process.env.CF_API_TOKEN) { await sock.sendMessage(jid, { text: `❌ Cloudflare API token not set. Use ${config.prefix}setvar CF_API_TOKEN <TOKEN>\nDocs: https://developers.cloudflare.com/workers-ai/` }); return; }
        await sock.sendMessage(jid, { text: `🎨 *Generating images...*\n\nPrompt: "${prompt}"\n\nPlease wait, this may take 10-30 seconds...` });
        try { await sock.sendPresenceUpdate('composing', jid); } catch {}
        const res = await imagesCF.generateImages(prompt, 2, {});
        try { await sock.sendPresenceUpdate('paused', jid); } catch {}
        if (res.success && res.images && res.images.length) {
            for (let i = 0; i < res.images.length; i++) {
                const caption = i === 0 ? `🖼️ *Image ${i + 1}/${res.images.length}*\n\nPrompt: "${prompt}"` : `🖼️ *Image ${i + 1}/${res.images.length}*`;
                await sock.sendMessage(jid, { image: res.images[i], caption });
                if (i < res.images.length - 1) { await new Promise(r => setTimeout(r, 500)); }
            }
        } else {
            const err = String(res.error || 'Generation failed');
            if (err.includes('401')) {
                await sock.sendMessage(jid, { text: `❌ Authentication error. Verify CF_ACCOUNT_ID and CF_API_TOKEN (Workers AI Read).` });
            } else {
                await sock.sendMessage(jid, { text: `❌ ${err}` });
            }
        }
    });

    registerCommand('image', 'Search and download images from Google', async (sock, msg, args) => {
        const query = args.join(' ').trim();
        const jid = msg.key.remoteJid;

        if (!query) {
            await sock.sendMessage(jid, {
                text: `💡 *Usage:* ${config.prefix}image <search query>\n\n` +
                      `*Examples:*\n` +
                      `${config.prefix}image sunset beach\n` +
                      `${config.prefix}image cute cats\n` +
                      `${config.prefix}image sports cars\n\n` +
                      `📊 Downloads up to 5 images by default.`
            });
            return;
        }

        // Send searching message
        const searchMsg = images.formatSearchMessage(query, 5);
        await sock.sendMessage(jid, { text: searchMsg });

        try {
            // Set composing presence
            try { await sock.sendPresenceUpdate('composing', jid); } catch {}

            // Search for images
            const imageUrls = await images.searchImages(query, 5);

            if (!imageUrls || imageUrls.length === 0) {
                await sock.sendMessage(jid, {
                    text: `❌ No images found for "${query}"\n\n` +
                          `💡 Try a different search term.`
                });
                return;
            }

            // Download images
            const downloadedPaths = await images.downloadImages(imageUrls, query);

            if (downloadedPaths.length === 0) {
                await sock.sendMessage(jid, {
                    text: `❌ Failed to download images for "${query}"\n\n` +
                          `💡 Please try again later.`
                });
                return;
            }

            // Send all downloaded images
            try { await sock.sendPresenceUpdate('composing', jid); } catch {}

            for (let i = 0; i < downloadedPaths.length; i++) {
                const imagePath = downloadedPaths[i];
                const imageBuffer = fs.readFileSync(imagePath);

                const caption = i === 0
                    ? `🖼️ *Image ${i + 1}/${downloadedPaths.length}*\n\n📝 Query: "${query}"\n\n💡 Powered by Fiazzy-MD`
                    : `🖼️ *Image ${i + 1}/${downloadedPaths.length}*`;

                await sock.sendMessage(jid, {
                    image: imageBuffer,
                    caption
                });

                // Cleanup: delete the downloaded file
                try {
                    fs.unlinkSync(imagePath);
                } catch {}

                // Small delay between images
                if (i < downloadedPaths.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            // Set paused presence
            try { await sock.sendPresenceUpdate('paused', jid); } catch {}

        } catch (error) {
            console.error('❌ Image search error:', error);
            await sock.sendMessage(jid, {
                text: `❌ Failed to search for images: ${error.message}\n\n` +
                      `💡 Tips:\n` +
                      `• Try a simpler search term\n` +
                      `• Check your internet connection\n` +
                      `• Try again in a few moments`
            });
        }
    });

    registerCommand('sticker2', 'Convert sticker to image/video or gif to video', handleSticker2);

    registerCommand('fancy', 'Convert text to fancy Unicode styles', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const m = msg.message || {};
        const quotedMsg = m.extendedTextMessage?.contextInfo?.quotedMessage;

        // Check if replying to a message with a style number
        if (quotedMsg && args.length === 1) {
            const styleNumber = parseInt(args[0]);

            if (isNaN(styleNumber) || styleNumber < 1 || styleNumber > 15) {
                await sock.sendMessage(jid, {
                    text: `❌ Invalid style number. Please use 1-15.\n\n` +
                          fancytext.getUsageMessage(config.prefix)
                });
                return;
            }

            // Get text from quoted message
            const quotedText = quotedMsg.conversation ||
                              quotedMsg.extendedTextMessage?.text ||
                              '';

            if (!quotedText) {
                await sock.sendMessage(jid, {
                    text: `❌ No text found in the quoted message.`
                });
                return;
            }

            const converted = fancytext.convertToStyle(quotedText, styleNumber);
            await sock.sendMessage(jid, { text: converted });
            return;
        }

        // Check if converting text with a specific style number
        if (args.length >= 2) {
            const styleNumber = parseInt(args[0]);

            if (isNaN(styleNumber) || styleNumber < 1 || styleNumber > 15) {
                // Treat first arg as text, show all styles
                const text = args.join(' ').trim();
                const allStyles = fancytext.generateAllStyles(text);
                await sock.sendMessage(jid, { text: allStyles });
                return;
            }

            // Convert with specific style
            const text = args.slice(1).join(' ');
            const converted = fancytext.convertToStyle(text, styleNumber);
            await sock.sendMessage(jid, { text: converted });
            return;
        }

        // Show all styles for single text input
        if (args.length === 1 && isNaN(parseInt(args[0]))) {
            const text = args[0];
            const allStyles = fancytext.generateAllStyles(text);
            await sock.sendMessage(jid, { text: allStyles });
            return;
        }

        // Show usage
        await sock.sendMessage(jid, { text: fancytext.getUsageMessage(config.prefix) });
    });

    // YouTube Search Command
    registerCommand('yts', 'Search YouTube results', async (sock, msg, args) => {
        const q = args.join(' ').trim();
        const chatId = msg.key.remoteJid;
        const userId = msg.key.participant || msg.key.remoteJid;
        
        if (!q) { 
            await sock.sendMessage(chatId, { text: `💡 Usage: ${config.prefix}yts <query or YouTube URL>\n\nAfter search, reply with a number (1-10) to download as MP3` }); 
            return; 
        }

        try {
            // If it's a URL, proceed to direct MP3 download
            if (youtube.isYTUrl(q)) {
                await sock.sendMessage(chatId, { text: `🎬 *DOWNLOADING MP3*\n\nDownloading this song at best available quality` });

                const downloadData = await ytvideo.getMp3DownloadUrl(q);
                const audioFile = await ytvideo.downloadFile(downloadData.download_url, downloadData.title || 'YouTube Audio');

                await sock.sendMessage(chatId, {
                    audio: { url: audioFile.filePath },
                    mimetype: 'audio/mpeg',
                    fileName: `${audioFile.title}.mp3`,
                    ptt: false
                }, { quoted: msg });

                await sock.sendMessage(chatId, { text: `✅ *Download Complete!*\n\n🎵 ${audioFile.title}` });
                await audioFile.cleanup();
                return;
            }

            await sock.sendMessage(chatId, { text: `🔍 Searching YouTube for: *${q}*\n\n⏳ Please wait...` });

            const results = await ytvideo.searchYouTube(q);

            if (!results || results.length === 0) {
                await sock.sendMessage(chatId, { text: `❌ No results found for: *${q}*` });
                return;
            }

            const storageKeyVid = `${chatId}:${userId}`;
            ytvideo.storeSearchSession(storageKeyVid, results);

            const resultsText = ytvideo.formatSearchResults(results, q);
            await sock.sendMessage(chatId, { text: resultsText }, { quoted: msg });

        } catch (e) {
            console.error('❌ YouTube search error:', e);
            await sock.sendMessage(chatId, { text: `❌ Failed to search YouTube: ${e.message}` });
        }
    });

    registerCommand('getjid', 'Show current chat JID', async (sock, msg) => {
        const jid = msg.key.remoteJid;
        await sock.sendMessage(jid, { text: `🆔 JID: ${jid}` });
    });

    registerCommand('gif', 'Convert replied short video to GIF', async (sock, msg) => {
        const chatId = msg.key.remoteJid;
        const quotedMsg = getQuotedMessage(msg);
        if (!quotedMsg) { await sock.sendMessage(chatId, { text: `💡 Reply to a short video with ${config.prefix}gif\n\n${CHANNEL_URL}`, ...CHANNEL_CONTEXT }); return; }
        let q = quotedMsg;
        if (q.ephemeralMessage) q = q.ephemeralMessage.message;
        if (!q.videoMessage) { await sock.sendMessage(chatId, { text: `❌ Reply to a short video\n\n${CHANNEL_URL}`, ...CHANNEL_CONTEXT }); return; }
        try {
            const buffer = await downloadMediaMessage({ message: quotedMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
            const mp4Gif = await gifFeature.convertVideoToGif(buffer, { maxSeconds: 8, watermarkText: CHANNEL_URL });
            await sock.sendMessage(chatId, { video: mp4Gif, gifPlayback: true, mimetype: 'video/mp4', caption: 'GIF', ...CHANNEL_CONTEXT }, { quoted: msg });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `❌ Failed to convert to GIF: ${e.message}\n\n${CHANNEL_URL}`, ...CHANNEL_CONTEXT });
        }
    });

    registerCommand('savejid', 'Save a name → JID mapping', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        let provided = args[0] || '';
        let name = args.slice(1).join(' ').trim();
        let targetJid = null;
        if (provided && (provided.includes('@s.whatsapp.net') || provided.includes('@g.us'))) {
            targetJid = provided.trim();
        } else {
            const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';
            targetJid = jids.extractJidFromText(quotedText);
            if (!targetJid && !name) {
                // If only one arg, treat it as name and use current chat JID
                name = provided.trim();
                targetJid = msg.key.remoteJid;
            }
        }
        if (!targetJid || !name) { await sock.sendMessage(jid, { text: `💡 Usage:\n- ${config.prefix}savejid <jid> <name>\n- Reply to a message that includes a JID and run: ${config.prefix}savejid <name>\n- ${config.prefix}savejid <name> (saves current chat JID)` }); return; }
        const ok = jids.saveJid(name, targetJid);
        await sock.sendMessage(jid, { text: ok ? `✅ Saved: ${name.toLowerCase()} → ${targetJid}` : '❌ Failed to save JID' });
    });

    // Owner-only Message Scheduler
    registerCommand('schedule', 'Schedule a message (owner only)', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) { await sock.sendMessage(jid, { text: '❌ Owner only.' }); return; }
        const raw = args.join(' ').trim();
        if (!raw) { await sock.sendMessage(jid, { text: `💡 Usage:\n- ${config.prefix}schedule in 10m <text>\n- ${config.prefix}schedule at 2025-12-01 14:30 <text>\n- ${config.prefix}schedule at 2025-12-01 14:30 <jid> <text>` }); return; }
        let targetJid = jid;
        let timestamp = null;
        let text = '';
        if (raw.startsWith('in ')) {
            const m = raw.match(/^in\s+(\d+)([mh])\s+([\s\S]+)$/);
            if (!m) { await sock.sendMessage(jid, { text: '❌ Invalid format. Example: schedule in 10m Hello' }); return; }
            const n = parseInt(m[1]); const unit = m[2]; text = m[3];
            const delta = unit === 'm' ? n * 60000 : n * 3600000;
            timestamp = Date.now() + delta;
        } else if (raw.startsWith('at ')) {
            const m = raw.match(/^at\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?:\s+([^\s]+))?\s+([\s\S]+)$/);
            if (!m) { await sock.sendMessage(jid, { text: '❌ Invalid format. Example: schedule at 2025-12-01 14:30 Hello' }); return; }
            const dateStr = m[1]; const timeStr = m[2]; const maybeJid = m[3]; text = m[4];
            const dt = new Date(`${dateStr}T${timeStr}:00`);
            timestamp = dt.getTime();
            if (maybeJid) {
                const resolved = jids.resolveJid(maybeJid);
                if (!resolved) { await sock.sendMessage(jid, { text: `❌ Unknown JID or name: ${maybeJid}` }); return; }
                targetJid = resolved;
            }
        } else { await sock.sendMessage(jid, { text: '❌ Start with "in" or "at".' }); return; }
        if (!timestamp || isNaN(timestamp)) { await sock.sendMessage(jid, { text: '❌ Invalid time.' }); return; }
        const id = `sch_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        scheduler.addSchedule({ id, jid: targetJid, text, timestamp, createdBy: senderJid });
        await sock.sendMessage(jid, { text: `✅ Scheduled (ID: ${id})\n• Chat: ${targetJid}\n• Time: ${new Date(timestamp).toLocaleString()}` });
    });

    registerCommand('schedules', 'List scheduled messages (owner only)', async (sock, msg) => {
        const jid = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) { await sock.sendMessage(jid, { text: '❌ Owner only.' }); return; }
        const items = scheduler.listSchedules();
        if (!items.length) { await sock.sendMessage(jid, { text: 'ℹ️ No scheduled messages.' }); return; }
        let text = '📅 *Scheduled Messages*\n\n';
        for (const it of items) { text += `• ID: ${it.id}\n  Chat: ${it.jid}\n  Time: ${new Date(it.timestamp).toLocaleString()}\n  Text: ${it.text.slice(0,60)}\n\n`; }
        await sock.sendMessage(jid, { text });
    });

    registerCommand('schedulecancel', 'Cancel a scheduled message (owner only)', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) { await sock.sendMessage(jid, { text: '❌ Owner only.' }); return; }
        const id = (args[0] || '').trim();
        if (!id) { await sock.sendMessage(jid, { text: `💡 Usage: ${config.prefix}schedulecancel <id>` }); return; }
        scheduler.removeSchedule(id);
        await sock.sendMessage(jid, { text: `✅ Cancelled schedule ${id}` });
    });

    // .song command removed by owner request
    
    // .video command removed by owner request

    registerCommand('spotify', 'Search and download Spotify tracks via Yupra', async (sock, msg, args) => {
        await spotify.spotifyCommand(sock, msg, args);
    });

    registerCommand('movie', 'Search and get movie recommendations', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const query = args.join(' ').trim();

        try {
            let movies;
            let responseText;

            if (!query || query.toLowerCase() === 'trending') {
                // Get trending movies
                await sock.sendMessage(jid, { text: '🎬 Fetching trending movies...' });
                movies = await getTrendingMovies(5);
                responseText = formatMovieResults(movies, config.prefix);
            } else if (query.toLowerCase() === 'random') {
                // Get random movie
                await sock.sendMessage(jid, { text: '🎬 Finding a random movie for you...' });
                const movie = await getRandomMovie();
                responseText = formatMovieDetails(movie);

                // Send poster if available
                if (movie.poster) {
                    await sock.sendMessage(jid, {
                        image: { url: movie.poster },
                        caption: responseText
                    });
                    return;
                }
            } else {
                // Search for movies
                await sock.sendMessage(jid, { text: `🎬 Searching for "${query}"...` });
                movies = await searchMovies(query, 5);
                responseText = formatMovieResults(movies, config.prefix);
            }

            await sock.sendMessage(jid, { text: responseText });

        } catch (error) {
            console.error('❌ Movie command error:', error);
            await sock.sendMessage(jid, {
                text: error.message.includes('TMDB_API_KEY')
                    ? '❌ *Movie search is not configured*\n\nThe bot owner needs to add a TMDb API key.\n\n💡 Get a free API key at: https://www.themoviedb.org/settings/api'
                    : `❌ Error fetching movies: ${error.message}\n\nPlease try again later.`
            });
        }
    });

    registerCommand('anime', 'Search and get anime recommendations', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const query = args.join(' ').trim();

        try {
            let animes;
            let responseText;

            if (!query || query.toLowerCase() === 'top') {
                // Get top anime
                await sock.sendMessage(jid, { text: '📺 Fetching top anime...' });
                animes = await getTopAnime(5);
                responseText = formatAnimeResults(animes, config.prefix);
            } else if (query.toLowerCase() === 'seasonal' || query.toLowerCase() === 'airing') {
                // Get seasonal anime
                await sock.sendMessage(jid, { text: '📺 Fetching currently airing anime...' });
                animes = await getSeasonalAnime(5);
                responseText = formatAnimeResults(animes, config.prefix);
            } else if (query.toLowerCase() === 'random') {
                // Get random anime
                await sock.sendMessage(jid, { text: '📺 Finding a random anime for you...' });
                const anime = await getRandomAnime();
                responseText = formatAnimeDetails(anime);

                // Send image if available
                if (anime.image) {
                    await sock.sendMessage(jid, {
                        image: { url: anime.image },
                        caption: responseText
                    });
                    return;
                }
            } else {
                // Search for anime
                await sock.sendMessage(jid, { text: `📺 Searching for "${query}"...` });
                animes = await searchAnime(query, 5);
                responseText = formatAnimeResults(animes, config.prefix);
            }

            await sock.sendMessage(jid, { text: responseText });

        } catch (error) {
            console.error('❌ Anime command error:', error);
            await sock.sendMessage(jid, {
                text: `❌ Error fetching anime: ${error.message}\n\nPlease try again in a few seconds. The Jikan API may be rate-limited.`
            });
        }
    });

    registerCommand('anime2', 'Download anime episodes', async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const query = args.join(' ').trim();

        await anime2.handleAnime2Command(sock, chatId, query, msg);
    });

    /* moved to features/group.js */
    /* registerCommand('warnlimit', 'Set warn limit for this group', async (sock, msg, args) => {
        if (!Permissions.isGroup(msg.key.remoteJid)) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' });
            return;
        }
        if (!args[0]) {
            const current = warnLimits.get(msg.key.remoteJid) || 3;
            await sock.sendMessage(msg.key.remoteJid, { text: `📊 Current warn limit: ${current}\n\nUse ${config.prefix}warnlimit <number>` });
            return;
        }
        const n = parseInt(args[0]);
        if (isNaN(n) || n < 1) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ Provide a valid number (1 or more)' });
            return;
        }
        warnLimits.set(msg.key.remoteJid, n);
        await sock.sendMessage(msg.key.remoteJid, { text: `✅ Warn limit set to ${n}` });
    }); */

    /* moved to features/group.js */
    /* registerCommand('antilink', 'Toggle anti-link for this chat', async (sock, msg, args) => {
        if (!Permissions.isGroup(msg.key.remoteJid)) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' });
            return;
        }
        const sub = (args[0] || '').toLowerCase();
        const actionArg = (args[1] || '').toLowerCase();
        const current = antiLinkSettings.get(msg.key.remoteJid) || { enabled: false, action: 'warn' };
        if (sub === 'on') {
            current.enabled = true;
            current.action = actionArg === 'kick' ? 'kick' : 'warn';
            antiLinkSettings.set(msg.key.remoteJid, current);
            await sock.sendMessage(msg.key.remoteJid, { text: `✅ Anti-link enabled (${current.action})` });
        } else if (sub === 'off') {
            current.enabled = false;
            antiLinkSettings.set(msg.key.remoteJid, current);
            await sock.sendMessage(msg.key.remoteJid, { text: '✅ Anti-link disabled' });
        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: `📊 Anti-link is ${current.enabled ? 'ON' : 'OFF'} (${current.action})\n\nUse ${config.prefix}antilink on [warn|kick] or ${config.prefix}antilink off` });
        }
    }); */

    // Universal message text extractor (handles all WhatsApp message types)
    function extractMessageText(message) {
        try {
            if (!message) return '';

            // Direct conversation
            if (message.conversation) return message.conversation;

            // Extended text message
            if (message.extendedTextMessage?.text)
                return message.extendedTextMessage.text;

            // Ephemeral (disappearing) messages
            if (message.ephemeralMessage)
                return extractMessageText(message.ephemeralMessage.message);

            // View once messages
            if (message.viewOnceMessage || message.viewOnceMessageV2 || message.viewOnceMessageV2Extension)
                return extractMessageText(message.viewOnceMessage?.message || message.viewOnceMessageV2?.message);

            // Image/Video captions
            if (message.imageMessage?.caption)
                return message.imageMessage.caption;

            if (message.videoMessage?.caption)
                return message.videoMessage.caption;

            // Document caption
            if (message.documentMessage?.caption)
                return message.documentMessage.caption;

            // Button responses
            if (message.buttonsResponseMessage?.selectedButtonId)
                return message.buttonsResponseMessage.selectedButtonId;

            // List responses
            if (message.listResponseMessage?.singleSelectReply?.selectedRowId)
                return message.listResponseMessage.singleSelectReply.selectedRowId;

            // Template button response
            if (message.templateButtonReplyMessage?.selectedId)
                return message.templateButtonReplyMessage.selectedId;

            return '';
        } catch {
            return '';
        }
    }

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        try {
            // Only handle notify messages (new messages), ignore history sync (append)
            if (m.type !== 'notify') return;

            const msg = m.messages[0];
            if (!msg.message) return;
            
            const rawTs = msg.messageTimestamp;
            let tsMs = 0;
            if (rawTs !== undefined && rawTs !== null) {
                const n = Number(rawTs);
                tsMs = n < 10000000000 ? n * 1000 : n;
            }
            
            const now = Date.now();
            // Strict Timestamp Validation:
            // 1. Ignore messages older than 2 minutes (prevents processing old pending messages on startup)
            // 2. Ignore messages from before connection established (safeguard)
            
            if (tsMs && (now - tsMs) > 120000) {
                 console.log(`⏳ Ignoring old message: ${Math.floor((now - tsMs)/1000)}s old`);
                 return;
            }

            if (connectedAtMs && tsMs && tsMs < (connectedAtMs - CONNECT_GRACE_MS)) return;
            try { presenceTargets.add(msg.key.remoteJid); } catch {}

            const preText = extractMessageText(msg.message).trim();

            // Check if sender is owner (to allow owner's non-command messages like game moves)
            const msgSenderJid = msg.key.participant || msg.key.remoteJid;
            const msgSenderNum = msgSenderJid.split('@')[0];
            const normalizeNum = (num) => String(num).replace(/[^0-9]/g, '');
            let ownerNum = config.ownerNumber;
            if (sock.user) {
                ownerNum = sock.user.id.split(':')[0];
            }
            const normOwner = normalizeNum(ownerNum);
            const normSender = normalizeNum(msgSenderNum);

            let isMsgFromOwner = false;

            // If fromMe is true, it means the message is from the bot's account (which IS the owner)
            // According to permissions.js line 79-81, fromMe means it's from the owner
            if (msg.key.fromMe) {
                isMsgFromOwner = true;
            } else {
                // For messages not from the bot (fromMe=false), check if sender matches owner number
                // Method 1: Exact number match
                if (normSender === normOwner) {
                    isMsgFromOwner = true;
                }
                // Method 2: Check if sender JID contains owner number
                if (!isMsgFromOwner && msgSenderJid.includes(normOwner)) {
                    isMsgFromOwner = true;
                }
                // Method 3: For groups, check if participant contains the owner number
                if (!isMsgFromOwner && sock.user) {
                    const isGrp = msg.key.remoteJid.endsWith('@g.us');
                    if (isGrp && msg.key.participant) {
                        isMsgFromOwner = msg.key.participant.includes(normOwner);
                    }
                }
            }

            // Only ignore fromMe messages if sender is NOT the owner (i.e., bot's own automated messages)
            // But since fromMe=true MEANS it's the owner, this will never ignore owner messages
            console.log('🔍 FromMe Filter Check:', {
                fromMe: msg.key.fromMe,
                isMsgFromOwner,
                msgSenderJid,
                normOwner,
                normSender,
                startsWithPrefix: preText.startsWith(config.prefix),
                willBeIgnored: msg.key.fromMe && !isMsgFromOwner && !preText.startsWith(config.prefix)
            });
            if (msg.key.fromMe && !isMsgFromOwner && !preText.startsWith(config.prefix)) return;

            console.log('📩 New message from:', msg.key.remoteJid);
            console.log('📋 Message type keys:', Object.keys(msg.message));

            try {
                const id = msg.key.id || '';
                const k = `${msg.key.remoteJid}:${id}`;
                if (!messageStore.has(k)) messageStore.set(k, msg.message);
            } catch {}

            const isRevoke = !!msg.message.protocolMessage && msg.message.protocolMessage.type === 0;
            if (isRevoke) {
                const chatId = msg.key.remoteJid;
                const enabled = (process.env.AUTO_ANTI_DELETE === 'true') || antiDeleteChats.get('global') || antiDeleteChats.get(chatId);
                if (enabled) {
                    try {
                        const ref = msg.message.protocolMessage.key || {};
                        const origKey = `${ref.remoteJid || chatId}:${ref.id}`;
                        const originalMsg = messageStore.get(origKey);
                        const who = (msg.key.participant || '').split('@')[0];
                        const label = who ? `♻️ Restored a deleted message by @${who}` : '♻️ Restored a deleted message';
                        const mentions = msg.key.participant ? [msg.key.participant] : [];

                        if (!originalMsg) {
                            await sock.sendMessage(chatId, { text: `${label}\n\n[content unavailable]`, mentions });
                        } else {
                            let m = originalMsg;
                            if (m.ephemeralMessage) m = m.ephemeralMessage.message;
                            let sent = false;
                            try {
                                if (m.imageMessage) {
                                    const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                                    await sock.sendMessage(chatId, { image: buffer, caption: label, mentions });
                                    sent = true;
                                } else if (m.videoMessage) {
                                    const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                                    await sock.sendMessage(chatId, { video: buffer, caption: label, mentions });
                                    sent = true;
                                } else if (m.documentMessage) {
                                    const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                                    await sock.sendMessage(chatId, { document: buffer, mimetype: m.documentMessage.mimetype || 'application/octet-stream', fileName: m.documentMessage.fileName || 'file', caption: label, mentions });
                                    sent = true;
                                } else if (m.audioMessage) {
                                    const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                                    await sock.sendMessage(chatId, { audio: buffer, mimetype: m.audioMessage.mimetype || 'audio/mpeg', ptt: false, fileName: 'audio' }, { quoted: msg });
                                    await sock.sendMessage(chatId, { text: label, mentions });
                                    sent = true;
                                } else if (m.stickerMessage) {
                                    const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                                    await sock.sendMessage(chatId, { sticker: buffer });
                                    await sock.sendMessage(chatId, { text: label, mentions });
                                    sent = true;
                                }
                            } catch {}
                            if (!sent) {
                                const txt = extractMessageText(originalMsg) || '[no text]';
                                await sock.sendMessage(chatId, { text: `${label}\n\n${txt}`, mentions });
                            }
                        }
                    } catch (e) {
                        console.error('❌ Anti-delete error:', e);
                    }
                }
            }

            // Auto view-once handler - works for all incoming view-once messages
            const autoVOEnabled = process.env.AUTO_VIEW_ONCE === 'true' || autoViewOnceChats.has('global');

            if (autoVOEnabled) {
                console.log('🔍 Auto view-once: Checking for view-once message...');
                const incomingVOMsg = unwrapViewOnce(msg.message);
                console.log('🔍 Auto view-once: View-once found:', !!incomingVOMsg);

                if (incomingVOMsg) {
                    try {
                        console.log('🔍 Auto view-once: Detected view-once message');
                        console.log('🔍 Auto view-once: Message keys:', Object.keys(incomingVOMsg));

                        const buffer = await downloadMediaMessage({ message: incomingVOMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });

                        if (incomingVOMsg.imageMessage) {
                            console.log('📤 Auto view-once: Sending image...');
                            await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption: '👀 Auto-opened view-once image' });
                        } else if (incomingVOMsg.videoMessage) {
                            console.log('📤 Auto view-once: Sending video...');
                            await sock.sendMessage(msg.key.remoteJid, { video: buffer, caption: '👀 Auto-opened view-once video' });
                        }
                        console.log('✅ Auto view-once: Successfully processed');
                    } catch (error) {
                        console.error('❌ Auto view-once error:', error);
                        console.error('Full error:', error.stack);
                    }
                }
            }

            const inGroup = Permissions.isGroup(msg.key.remoteJid);
            const antiCfg = antiLinkSettings.get(msg.key.remoteJid) || { enabled: false, action: 'warn' };
            if (inGroup && antiCfg.enabled && !msg.key.fromMe) {
                const senderIsAdmin = await Permissions.isUserAdmin(sock, msg.key.remoteJid, msg.key.participant);
                const isOwnerSender = Permissions.getSenderNumber(msg) === config.ownerNumber;
                const hasLink = /((https?:\/\/)|(www\.))|chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(preText);
                if (hasLink && !senderIsAdmin && !isOwnerSender) {
                    try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); } catch {}
                    if (antiCfg.action === 'kick') {
                        try {
                            await sock.groupParticipantsUpdate(msg.key.remoteJid, [msg.key.participant], 'remove');
                            await sock.sendMessage(msg.key.remoteJid, { text: `⛔ Link detected. Kicked @${msg.key.participant.split('@')[0]}`, mentions: [msg.key.participant] });
                        } catch (e) {
                            await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ Failed to kick: ${e.message}` });
                        }
                    } else {
                        const limit = warnLimits.get(msg.key.remoteJid) || 3;
                        const groupMap = warnCounts.get(msg.key.remoteJid) || new Map();
                        const c = (groupMap.get(msg.key.participant) || 0) + 1;
                        groupMap.set(msg.key.participant, c);
                        warnCounts.set(msg.key.remoteJid, groupMap);
                        if (c >= limit) {
                            try {
                                await sock.groupParticipantsUpdate(msg.key.remoteJid, [msg.key.participant], 'remove');
                                await sock.sendMessage(msg.key.remoteJid, { text: `⛔ Warn limit reached. Kicked @${msg.key.participant.split('@')[0]}`, mentions: [msg.key.participant] });
                            } catch (e) {
                                await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ Failed to kick: ${e.message}` });
                            }
                        } else {
                            await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ Link detected. Warned @${msg.key.participant.split('@')[0]} (${c}/${limit})`, mentions: [msg.key.participant] });
                        }
                    }
                }
            }

            const messageText = preText;

            // Return if no message text
            if (!messageText || messageText.length === 0) return;

            // Antiwords check for group messages
            if (Permissions.isGroup(msg.key.remoteJid) && !msg.key.fromMe) {
                try {
                    const { checkAntiwords } = require('./lib');
                    const antiwordsResult = checkAntiwords(msg.key.remoteJid, messageText);
                    
                    if (antiwordsResult.found) {
                        console.log(`Antiword detected in ${msg.key.remoteJid}: ${antiwordsResult.words.join(', ')}`);
                        let isAdmin = false;
                        try {
                            const meta = await sock.groupMetadata(msg.key.remoteJid);
                            const sender = msg.key.participant || msg.key.remoteJid;
                            const sn = String(sender).split('@')[0].replace(/[^0-9]/g, '');
                            const parts = meta.participants || [];
                            const match = parts.find(p => {
                                const pn = String(p.id || '').split('@')[0].replace(/[^0-9]/g, '');
                                return p.id === sender || pn === sn || (p.id || '').includes(sn);
                            });
                            isAdmin = !!(match && match.admin);
                        } catch {}
                        if (isAdmin) {
                            return;
                        }
                        
                        // Take action based on settings
                        switch (antiwordsResult.action) {
                            case 'kick':
                                try {
                                    await sock.groupParticipantsUpdate(
                                        msg.key.remoteJid,
                                        [msg.key.participant || msg.key.remoteJid],
                                        'remove'
                                    );
                                    await sock.sendMessage(msg.key.remoteJid, {
                                        text: `⚠️ User removed for using forbidden words: ${antiwordsResult.words.join(', ')}`
                                    });
                                } catch (error) {
                                    console.error('Failed to kick user:', error);
                                    await sock.sendMessage(msg.key.remoteJid, {
                                        text: `⚠️ Forbidden words detected: ${antiwordsResult.words.join(', ')}`
                                    });
                                }
                                break;
                            
                            case 'warn':
                                // Use the existing warning system
                                const limit = warnLimits.get(msg.key.remoteJid) || 3;
                                const groupMap = warnCounts.get(msg.key.remoteJid) || new Map();
                                const c = (groupMap.get(msg.key.participant) || 0) + 1;
                                groupMap.set(msg.key.participant, c);
                                warnCounts.set(msg.key.remoteJid, groupMap);
                                try { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); } catch (error) {}
                                
                                if (c >= limit) {
                                    try {
                                        await sock.groupParticipantsUpdate(
                                            msg.key.remoteJid,
                                            [msg.key.participant],
                                            'remove'
                                        );
                                        await sock.sendMessage(msg.key.remoteJid, {
                                            text: `⛔ Antiword warn limit reached. Kicked @${msg.key.participant.split('@')[0]} for using: ${antiwordsResult.words.join(', ')}`,
                                            mentions: [msg.key.participant]
                                        });
                                    } catch (e) {
                                        await sock.sendMessage(msg.key.remoteJid, {
                                            text: `⚠️ Failed to kick: ${e.message}`
                                        });
                                    }
                                } else {
                                    await sock.sendMessage(msg.key.remoteJid, {
                                        text: `⚠️ Warning: Forbidden words detected: ${antiwordsResult.words.join(', ')}\n\n@${msg.key.participant.split('@')[0]} warned (${c}/${limit})`,
                                        mentions: [msg.key.participant]
                                    });
                                }
                                break;
                            
                            default:
                                try {
                                    await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                                } catch (error) {
                                    console.error('Failed to delete antiword message:', error);
                                }
                                await sock.sendMessage(msg.key.remoteJid, {
                                    text: `⚠️ Message removed for containing forbidden words: ${antiwordsResult.words.join(', ')}`
                                });
                                break;
                        }
                        return; // Don't process commands if antiword was found
                    }
                } catch (error) {
                    console.error('Antiwords check error:', error);
                }
            }

            console.log('💬 Message:', messageText);
            console.log('🔍 Prefix:', config.prefix);
            console.log('🔍 Starts with prefix?', messageText.startsWith(config.prefix));

            // User/chat ids for downstream handlers
            const userId = msg.key.participant || msg.key.remoteJid;
            const chatId = msg.key.remoteJid;

            // Check for emojimix sticker session (before prefix and command processing)
            try {
                const storageKeyEmojiMix = `${chatId}:${userId}`;
                const EmojimixFeature = require('./features/emojimix');
                const sessions = EmojimixFeature.sessions;
                const composeBuffers = EmojimixFeature.composeBuffers;
                const mObj = msg.message || {};
                let stickerMsg = mObj.stickerMessage;
                if (mObj.ephemeralMessage && mObj.ephemeralMessage.message) {
                    const inner = mObj.ephemeralMessage.message;
                    if (inner.stickerMessage) stickerMsg = inner.stickerMessage;
                }
                const sess = sessions.get(storageKeyEmojiMix);
                if (sess && stickerMsg) {
                    const buffer = await downloadMediaMessage({ message: msg.message }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    sess.items.push(buffer);
                    if (sess.items.length >= 2) {
                        sessions.delete(storageKeyEmojiMix);
                        try { await sock.sendPresenceUpdate('composing', chatId); } catch {}
                        const mixed = await composeBuffers(sess.items[0], sess.items[1]);
                        const { createStickerBuffer } = require('./features/sticker');
                        const stickerBuf = await createStickerBuffer(mixed, 'FIAZZY-MD', 'fiazzypaul');
                        await sock.sendMessage(chatId, { sticker: stickerBuf });
                        try { await sock.sendPresenceUpdate('paused', chatId); } catch {}
                    } else {
                        await sock.sendMessage(chatId, { text: `🧩 Sticker 1 received. Send one more sticker.` });
                    }
                    return;
                }
            } catch (e) {
                console.error('Emojimix session error:', e.message);
            }

            // Check for song download number reply (before prefix check)

            // Check for song download reply
            const storageKeySongReply = `${chatId}:${userId}`;
            const songSession = songs.getSearchSession(storageKeySongReply);
            if (songSession) {
                const trimmed = messageText.trim();
                
                if (trimmed === '1') {
                    const result = songSession.result;
                    try {
                        await sock.sendMessage(chatId, {
                            text: `🎵 *DOWNLOADING SONG*\n\n📝 Title: ${result.title}\n⏳ Please wait...`
                        });

                        const audioData = await songs.downloadSong(result.audio.download_url, result.title);

                        // Send the audio file
                        await sock.sendMessage(chatId, {
                            audio: { url: audioData.filePath },
                            mimetype: 'audio/mpeg',
                            fileName: `${audioData.title}.mp3`,
                            ptt: false
                        }, { quoted: msg });

                        await sock.sendMessage(chatId, {
                            text: `✅ *Download Complete!*\n\n🎵 ${audioData.title}\n⏱️ Duration: ${result.duration}`
                        });

                        // Delete file after sending
                        await audioData.cleanup();

                        // Clear session
                        songs.clearSearchSession(storageKeySongReply);

                    } catch (error) {
                        console.error('❌ Song download error:', error);
                        await sock.sendMessage(chatId, {
                            text: `❌ Failed to download song!\n\n` +
                                  `Error: ${error.message}`
                        });
                    }
                    return;
                } else if (trimmed === '2') {
                    await sock.sendMessage(chatId, { text: '❌ Download cancelled.' });
                    songs.clearSearchSession(storageKeySongReply);
                    return;
                }
            }

            // Check for Spotify download reply
            const storageKeySpotifyReply = `${chatId}:${userId}`;
            const spotifySession = spotify.getSearchSession(storageKeySpotifyReply);
            if (spotifySession) {
                const trimmed = messageText.trim();
                const num = parseInt(trimmed);

                if (!isNaN(num) && num >= 1 && num <= spotifySession.results.length) {
                    const selectedTrack = spotifySession.results[num - 1];

                    try {
                        await sock.sendMessage(chatId, {
                            text: `🎵 Downloading: ${selectedTrack.name || 'Unknown title'} - ${selectedTrack.artist || ''}\n⏳ Please wait...`
                        });

                        await spotify.downloadTrackSelection(sock, chatId, msg, selectedTrack);

                        spotify.clearSearchSession(storageKeySpotifyReply);
                    } catch (error) {
                        console.error('❌ Spotify download error:', error);
                        await sock.sendMessage(chatId, {
                            text: '❌ Failed to download Spotify track.\n\nPlease try searching again with .spotify'
                        });
                    }
                    return;
                }
            }

            // Check for video download reply (shared by yts and ytvideo)
            const storageKeyVidReply = `${chatId}:${userId}`;
            const videoSession = ytvideo.getSearchSession(storageKeyVidReply);
            if (videoSession) {
                const trimmed = messageText.trim();
                const num = parseInt(trimmed);

                if (!isNaN(num) && num >= 1 && num <= videoSession.results.length) {
                    const selected = videoSession.results[num - 1];

                    try {
                        // Determine command based on session or search result type
                        // For yts, we use MP3. For ytvideo search, we use MP4.
                        const isYtVideoCommand = lastUsedCommand === 'ytvideo';
                        
                        if (isYtVideoCommand) {
                            await sock.sendMessage(chatId, {
                                text: `🎬 *DOWNLOADING MP4*\n\nDownloading: *${selected.title}* at best available quality`
                            });

                            const downloadData = await ytvideo.getMp4DownloadUrl(selected.url);
                            const videoFile = await ytvideo.downloadFile(downloadData.url, downloadData.title || selected.title, '.mp4');

                            await sock.sendMessage(chatId, {
                                video: { url: videoFile.filePath },
                                mimetype: 'video/mp4',
                                fileName: `${videoFile.title}.mp4`,
                                caption: `✅ *Download Complete!*\n\n🎬 ${videoFile.title}`
                            }, { quoted: msg });

                            await videoFile.cleanup();
                        } else {
                            await sock.sendMessage(chatId, {
                                text: `🎬 *DOWNLOADING MP3*\n\nDownloading: *${selected.title}* at best available quality`
                            });

                            const downloadData = await ytvideo.getMp3DownloadUrl(selected.url);
                            const audioFile = await ytvideo.downloadFile(downloadData.download_url, downloadData.title || selected.title);

                            await sock.sendMessage(chatId, {
                                audio: { url: audioFile.filePath },
                                mimetype: 'audio/mpeg',
                                fileName: `${audioFile.title}.mp3`,
                                ptt: false
                            }, { quoted: msg });

                            await sock.sendMessage(chatId, { text: `✅ *Download Complete!*\n\n🎵 ${audioFile.title}` });
                            
                            await audioFile.cleanup();
                        }
                        
                        ytvideo.clearSearchSession(storageKeyVidReply);

                    } catch (error) {
                        console.error('❌ YouTube selection error:', error);
                        await sock.sendMessage(chatId, {
                            text: `❌ Failed to download selection!\n\nError: ${error.message}`
                        });
                    }
                    return;
                }
            }

            // Check for anime2 download reply
            const storageKeyAnime2Reply = `${chatId}:${userId}`;
            const handled = await anime2.handleAnime2Selection(sock, chatId, messageText.trim(), msg);
            if (handled) {
                return; // Don't process as a command
            }

            // Check for trivia answer (allow all users including owner)
            const triviaSession = trivia.getSession(chatId);
            if (triviaSession && !messageText.startsWith(config.prefix)) {
                // Ignore bot's own trivia questions and results (they contain these patterns)
                const isBotTriviaMessage = messageText.includes('*TRIVIA CHALLENGE*') ||
                                          messageText.includes('*CORRECT!*') ||
                                          messageText.includes('*INCORRECT!*') ||
                                          messageText.includes("*Time's Up!*");

                if (!isBotTriviaMessage) {
                    const userAnswer = messageText.trim();

                    // Check the answer
                    const result = trivia.checkAnswer(chatId, userAnswer);

                    // Send result message
                    await sock.sendMessage(chatId, {
                        text: result.message
                    }, { quoted: msg });

                    return; // Don't process as a command
                }
            }

            // Check for tic-tac-toe move (only if not a command)
            if (!messageText.startsWith(config.prefix)) {
                const tttGame = tictactoe.getGame(chatId);
                if (tttGame) {
                    const trimmed = messageText.trim();
                    const position = parseInt(trimmed);

                    console.log('🎮 TTT Move Check:', {
                        chatId,
                        userId,
                        'msg.key.participant': msg.key.participant,
                        'msg.key.remoteJid': msg.key.remoteJid,
                        'msg.key.fromMe': msg.key.fromMe,
                        trimmed,
                        position,
                        isValidNumber: !isNaN(position) && position >= 1 && position <= 9,
                        currentTurn: tttGame.currentTurn,
                        currentPlayer: tttGame.players[tttGame.currentTurn],
                        playerX: tttGame.players.X,
                        playerO: tttGame.players.O
                    });

                    if (!isNaN(position) && position >= 1 && position <= 9) {
                        const result = tictactoe.makeMove(chatId, userId, position);

                        console.log('🎮 TTT Move Result:', result);

                        if (!result.success) {
                            await sock.sendMessage(chatId, { text: result.message });
                            return;
                        }

                        // Send updated board
                        const boardText = tictactoe.formatBoard(result.game);
                        await sock.sendMessage(chatId, {
                            text: boardText,
                            mentions: [result.game.players.X, result.game.players.O]
                        });

                        // If game is over, delete it
                        if (result.gameOver) {
                            tictactoe.deleteGame(chatId);
                        }

                        return; // Don't process as a command
                    }
                }

                // Check for word chain game move
                const wcgGame = wcg.getGame(chatId);
                if (wcgGame) {
                    const word = messageText.trim();

                    // Check if it's a valid word attempt (letters only, 2+ chars)
                    if (/^[a-z]+$/i.test(word) && word.length >= 2) {
                        // Show "checking word..." message
                        await sock.sendMessage(chatId, { text: '🔍 Checking word...' });

                        const result = await wcg.submitWord(chatId, userId, word);

                        console.log('🔗 WCG Move Result:', result);

                        if (!result.success) {
                            if (result.gameOver) {
                                // Player lost
                                await sock.sendMessage(chatId, {
                                    text: result.message + '\n\n' +
                                          `🏆 @${result.winner.split('@')[0]} wins!\n\n` +
                                          `📊 Final Stats:\n` +
                                          `💬 Words used: ${wcgGame.usedWords.size}\n` +
                                          `🎯 Moves: ${wcgGame.moves}`,
                                    mentions: [result.loser, result.winner]
                                });
                                wcg.deleteGame(chatId);
                            } else {
                                await sock.sendMessage(chatId, { text: result.message });
                            }
                            return;
                        }

                        // Valid move - restart timer for next player
                        wcg.startTurnTimer(chatId, async (timedOutChatId) => {
                            const timedOutGame = wcg.getGame(timedOutChatId);
                            if (!timedOutGame) return;

                            const loser = timedOutGame.players[timedOutGame.currentTurn];
                            const winner = timedOutGame.players[timedOutGame.currentTurn === 'player1' ? 'player2' : 'player1'];

                            await sock.sendMessage(timedOutChatId, {
                                text: `⏰ *TIME'S UP!*\n\n` +
                                      `@${loser.split('@')[0]} took too long to respond!\n\n` +
                                      `🏆 @${winner.split('@')[0]} wins!\n\n` +
                                      `📊 Final Stats:\n` +
                                      `💬 Words used: ${timedOutGame.usedWords.size}\n` +
                                      `🎯 Moves: ${timedOutGame.moves}`,
                                mentions: [loser, winner]
                            });

                            wcg.deleteGame(timedOutChatId);
                        });

                        // Send updated game status
                        const gameText = wcg.formatGame(result.game);
                        await sock.sendMessage(chatId, {
                            text: gameText,
                            mentions: [result.game.players.player1, result.game.players.player2]
                        });

                        return; // Don't process as a command
                    }
                }
            }

            // Check if message starts with prefix
            if (!messageText.startsWith(config.prefix)) {
                console.log('❌ Message does not start with prefix, ignoring');
                return;
            }

            // Parse command
            const args = messageText.slice(config.prefix.length).trim().split(/\s+/);
            const commandName = args.shift().toLowerCase();
            console.log('🔍 Command name:', commandName);
            console.log('🔍 Command exists?', commands.has(commandName));

            // Get sender number using permission system
            const senderNumber = getSenderNumber(msg);
            console.log('🔍 Sender number:', senderNumber);
            console.log('🔍 Owner number:', config.ownerNumber);

            // Check bot mode and permissions
            const permission = await PermissionsObj.canRunCommand(sock, msg, commandName);
            if (!permission.allowed) {
                if (permission.silent) {
                    console.log('❌ Permission denied (silent).');
                    return;
                }
                console.log('❌ Permission denied:', permission.reason);
                await sock.sendMessage(msg.key.remoteJid, { text: permission.reason });
                return;
            }

            // Execute command
            const command = commands.get(commandName);
            if (command) {
                console.log(`⚡ Executing command: ${config.prefix}${commandName}`);
                await command.handler(sock, msg, args);
            } else {
                console.log(`❓ Unknown command: ${commandName}`);
            }
        } catch (error) {
            console.error('❌ Error handling message:', error.message);
            console.error('Full error:', error.stack);
            // Don't crash the bot, just log the error
        }
    });

    sock.ev.on('group-participants.update', async (update) => {
        try {
            const { id, participants, action } = update;
            if (!isWelcomeEnabled(id)) return;
            if (action === 'add') {
                for (const user of participants || []) {
                    await sendWelcomeMessage(sock, id, user);
                }
            } else if (action === 'remove' || action === 'leave') {
                for (const user of participants || []) {
                    await sendGoodbyeMessage(sock, id, user);
                }
            }
        } catch (e) {
            console.error('❌ Welcome handler error:', e);
        }
    });

    sock.ev.on('messages.update', async (updates) => {
        try {
            for (const u of updates) {
                const proto = u.message?.protocolMessage;
                if (!proto || proto.type !== 0) continue;
                const enabled = (process.env.AUTO_ANTI_DELETE === 'true') || antiDeleteChats.get('global');
                if (!enabled) continue;
                const chatId = proto.key?.remoteJid || u.key?.remoteJid;
                const deletedId = proto.key?.id || u.key?.id;
                if (!chatId || !deletedId) continue;
                const origKey = `${chatId}:${deletedId}`;
                const originalMsg = messageStore.get(origKey);
                const who = (u.key?.participant || '').split('@')[0];
                const label = who ? `♻️ Restored a deleted message by @${who}` : '♻️ Restored a deleted message';
                const mentions = u.key?.participant ? [u.key.participant] : [];
                if (!originalMsg) {
                    await sock.sendMessage(chatId, { text: `${label}\n\n[content unavailable]`, mentions });
                    continue;
                }
                let m = originalMsg;
                if (m.ephemeralMessage) m = m.ephemeralMessage.message;
                let sent = false;
                try {
                    if (m.imageMessage) {
                        const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                        await sock.sendMessage(chatId, { image: buffer, caption: label, mentions });
                        sent = true;
                    } else if (m.videoMessage) {
                        const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                        await sock.sendMessage(chatId, { video: buffer, caption: label, mentions });
                        sent = true;
                    } else if (m.documentMessage) {
                        const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                        await sock.sendMessage(chatId, { document: buffer, mimetype: m.documentMessage.mimetype || 'application/octet-stream', fileName: m.documentMessage.fileName || 'file', caption: label, mentions });
                        sent = true;
                    } else if (m.audioMessage) {
                        const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                        await sock.sendMessage(chatId, { audio: buffer, mimetype: m.audioMessage.mimetype || 'audio/mpeg', ptt: false, fileName: 'audio' });
                        await sock.sendMessage(chatId, { text: label, mentions });
                        sent = true;
                    } else if (m.stickerMessage) {
                        const buffer = await downloadMediaMessage({ message: originalMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                        await sock.sendMessage(chatId, { sticker: buffer });
                        await sock.sendMessage(chatId, { text: label, mentions });
                        sent = true;
                    }
                } catch {}
                if (!sent) {
                    const txt = extractMessageText(originalMsg) || '[no text]';
                    await sock.sendMessage(chatId, { text: `${label}\n\n${txt}`, mentions });
                }
            }
        } catch (e) {
            console.error('❌ Anti-delete update error:', e);
        }
    });

    sock.ev.on('messages.upsert', async (status) => {
        try {
            const first = status.messages && status.messages[0];
            const rawTs = first && first.messageTimestamp;
            let tsMs = 0;
            if (rawTs !== undefined && rawTs !== null) {
                const n = Number(rawTs);
                tsMs = n < 10000000000 ? n * 1000 : n;
            }
            if (connectedAtMs && tsMs && tsMs < (connectedAtMs - CONNECT_GRACE_MS)) return;
            await autoStatus.handleStatusUpdate(sock, status);
        } catch (e) { console.error('autostatus upsert error:', e.message); }
    });

    // Register group commands
    try { 
      registerGroupCommands({ sock, config, Permissions, registerCommand, muteTimers, warnLimits, warnCounts, antiLinkSettings, saveAntiLinkSettings: saveAntiLinkSettingsToDisk }); 
    }
    catch (e) {
      console.error('❌ Failed to register group commands:', e && e.message ? e.message : e);
    }

    // Group Profile Picture Command
    registerCommand('gpp', 'Update group profile picture', async (sock, msg) => {
        try {
            await updateGroupProfilePicture(sock, msg);
        } catch (error) {
            console.error('❌ GPP command error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to update group profile picture!\n\n` +
                      `Error: ${error.message}\n\n` +
                      `💡 Make sure:\n` +
                      `• You replied to an image\n` +
                      `• You are a group admin\n` +
                      `• The image is valid`
            });
        }
    });

    // Leave Group Command
    registerCommand('left', 'Make bot leave the group', async (sock, msg) => {
        const jid = msg.key.remoteJid;

        // Check if it's a group
        if (!jid.endsWith('@g.us')) {
            await sock.sendMessage(jid, {
                text: '❌ This command only works in groups!'
            });
            return;
        }

        try {
            // Send goodbye message
            await sock.sendMessage(jid, {
                text: '👋 *Goodbye!*\n\n' +
                      '🤖 Bot is leaving the group as requested.\n\n' +
                      '💫 Thanks for using FiazzyMD!'
            });

            // Wait 2 seconds then leave
            await new Promise(resolve => setTimeout(resolve, 2000));
            await sock.groupLeave(jid);
            console.log(`✅ Bot left group: ${jid}`);

        } catch (error) {
            console.error('❌ Error leaving group:', error);
            await sock.sendMessage(jid, {
                text: `❌ Failed to leave group!\n\nError: ${error.message}`
            });
        }
    });

    // Tic-Tac-Toe Game Command
    registerCommand('ttt', 'Play tic-tac-toe with another user', async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const playerJid = msg.key.participant || msg.key.remoteJid;

        // Check if user wants to end the game
        if (args[0] === 'end') {
            const game = tictactoe.getGame(chatId);
            if (!game) {
                await sock.sendMessage(chatId, { text: '❌ No active game to end.' });
                return;
            }
            tictactoe.deleteGame(chatId);
            await sock.sendMessage(chatId, { text: '✅ Game ended.' });
            return;
        }

        // Debug command to check game state
        if (args[0] === 'debug') {
            const game = tictactoe.getGame(chatId);
            if (!game) {
                await sock.sendMessage(chatId, { text: '❌ No active game.' });
                return;
            }
            await sock.sendMessage(chatId, {
                text: `🔍 *DEBUG INFO*\n\n` +
                      `Player X: @${game.players.X.split('@')[0]}\n` +
                      `Player O: @${game.players.O.split('@')[0]}\n` +
                      `Current Turn: ${game.currentTurn}\n` +
                      `Your JID: @${playerJid.split('@')[0]}`,
                mentions: [game.players.X, game.players.O, playerJid]
            });
            return;
        }

        // Get mentioned user (opponent)
        const opponentJid = tictactoe.getMentionedUser(msg);

        if (!opponentJid) {
            await sock.sendMessage(chatId, {
                text: '🎮 *TIC-TAC-TOE GAME* 🎮\n\n' +
                      `*Usage:*\n` +
                      `${config.prefix}ttt @user - Start a game\n` +
                      `${config.prefix}ttt end - End current game\n\n` +
                      `*How to play:*\n` +
                      `1. Tag someone to challenge them\n` +
                      `2. Reply with a number (1-9) to make your move\n` +
                      `3. First to get 3 in a row wins!\n\n` +
                      `*Example:* ${config.prefix}ttt @friend`
            });
            return;
        }

        // Check if user is trying to play with themselves
        if (opponentJid === playerJid) {
            await sock.sendMessage(chatId, { text: '❌ You cannot play with yourself!' });
            return;
        }

        // Check if there's already an active game
        const existingGame = tictactoe.getGame(chatId);
        if (existingGame) {
            await sock.sendMessage(chatId, {
                text: '⚠️ There is already an active game in this chat!\n\n' +
                      `Use ${config.prefix}ttt end to end it first, then start a new game.`
            });
            return;
        }

        // Create new game
        console.log('🎮 Creating TTT game:', {
            chatId,
            playerJid,
            opponentJid
        });

        const game = tictactoe.createGame(chatId, playerJid, opponentJid);

        console.log('🎮 Game created:', {
            playerX: game.players.X,
            playerO: game.players.O,
            currentTurn: game.currentTurn
        });

        const boardText = tictactoe.formatBoard(game);

        await sock.sendMessage(chatId, {
            text: boardText,
            mentions: [playerJid, opponentJid]
        });
    });

    // Register Word Chain Game command
    registerCommand('wcg', 'Play word chain game with another player', async (sock, msg, args) => {
        const chatId = msg.key.remoteJid;
        const playerJid = msg.key.participant || msg.key.remoteJid;

        // Handle 'end' subcommand
        if (args[0] === 'end') {
            const game = wcg.getGame(chatId);
            if (!game) {
                await sock.sendMessage(chatId, { text: '❌ No active game to end.' });
                return;
            }

            const duration = Math.floor((Date.now() - game.startTime) / 1000);
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;

            await sock.sendMessage(chatId, {
                text: `🏁 *GAME ENDED!*\n\n` +
                      `📊 *Stats:*\n` +
                      `💬 Words used: ${game.usedWords.size}\n` +
                      `🎯 Moves: ${game.moves}\n` +
                      `⏱️ Duration: ${minutes}m ${seconds}s\n` +
                      `🔤 Last word: ${game.currentWord || 'none'}\n\n` +
                      `Thanks for playing! 🎉`
            });

            wcg.deleteGame(chatId);
            return;
        }

        // Get opponent
        const opponentJid = wcg.getMentionedUser(msg);

        if (!opponentJid) {
            await sock.sendMessage(chatId, {
                text: '🔗 *WORD CHAIN GAME* 🔗\n\n' +
                      `*Usage:*\n` +
                      `${config.prefix}wcg @user - Challenge a player\n` +
                      `${config.prefix}wcg end - End current game\n\n` +
                      `*Rules:*\n` +
                      `1. Tag someone to challenge them\n` +
                      `2. Take turns saying valid English words\n` +
                      `3. Each word must start with the last letter of the previous word\n` +
                      `4. Can't repeat words already used\n` +
                      `5. ⏰ You have 20 seconds to respond or you lose!\n` +
                      `6. Only real English words are accepted (dictionary verified)\n\n` +
                      `*Example:* ${config.prefix}wcg @friend`
            });
            return;
        }

        if (opponentJid === playerJid) {
            await sock.sendMessage(chatId, { text: '❌ You cannot play with yourself!' });
            return;
        }

        // Check for existing game
        const existingGame = wcg.getGame(chatId);
        if (existingGame) {
            await sock.sendMessage(chatId, {
                text: '⚠️ There is already an active game in this chat!\n\n' +
                      `Use ${config.prefix}wcg end to end it first, then start a new game.`
            });
            return;
        }

        // Create game
        const game = wcg.createGame(chatId, playerJid, opponentJid);

        // Start the turn timer
        wcg.startTurnTimer(chatId, async (timedOutChatId) => {
            const timedOutGame = wcg.getGame(timedOutChatId);
            if (!timedOutGame) return;

            const loser = timedOutGame.players[timedOutGame.currentTurn];
            const winner = timedOutGame.players[timedOutGame.currentTurn === 'player1' ? 'player2' : 'player1'];

            await sock.sendMessage(timedOutChatId, {
                text: `⏰ *TIME'S UP!*\n\n` +
                      `@${loser.split('@')[0]} took too long to respond!\n\n` +
                      `🏆 @${winner.split('@')[0]} wins!\n\n` +
                      `📊 Final Stats:\n` +
                      `💬 Words used: ${timedOutGame.usedWords.size}\n` +
                      `🎯 Moves: ${timedOutGame.moves}`,
                mentions: [loser, winner]
            });

            wcg.deleteGame(timedOutChatId);
        });

        const gameText = wcg.formatGame(game);
        await sock.sendMessage(chatId, {
            text: gameText,
            mentions: [playerJid, opponentJid]
        });
    });

    // Register mediafire command
    try {
      registerMediafireCommand({ registerCommand });
    }
    catch (e) {
      console.error('❌ Failed to register mediafire command:', e && e.message ? e.message : e);
    }

    // Register antiwords command
    try {
      registerAntiwordsCommand({ registerCommand });
    }
    catch (e) {
      console.error('❌ Failed to register antiwords command:', e && e.message ? e.message : e);
    }

    // Register apk command
    try {
      registerApkCommand({ registerCommand });
      registerEmojimixCommand({ registerCommand });
      registerEphotoCommands({ registerCommand });
      registerOtplockCommand({ registerCommand });
      registerCommand('seesudo', 'List sudo users (owner only)', async (sock, msg) => {
        const jid = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) { await sock.sendMessage(jid, { text: '❌ Owner only.' }); return; }
        const list = sudoFeature.listSudos();
        if (!list.length) { await sock.sendMessage(jid, { text: 'ℹ️ No sudo users set.' }); return; }
        const numbers = list.map(n => String(n));
        let mentions = numbers.map(n => `${n}@s.whatsapp.net`);
        try {
          if (jid.endsWith('@g.us')) {
            const meta = await sock.groupMetadata(jid);
            const parts = meta.participants || [];
            mentions = numbers.map(n => {
              const match = parts.find(p => (p.id || '').includes(n));
              return match ? match.id : `${n}@s.whatsapp.net`;
            });
          }
        } catch {}
        const lines = mentions.map((m, i) => `${i + 1}. @${m.split('@')[0]}`);
        const text = `👑 *Sudo Users*\n\n${lines.join('\n')}`;
        await sock.sendMessage(jid, { text, mentions });
      });
      registerCommand('setsudo', 'Add a sudo user (owner only)', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) { await sock.sendMessage(jid, { text: '❌ Owner only.' }); return; }
        let num = '';
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        if (args[0]) num = String(args[0]).replace(/[^0-9]/g, '');
        if (!num && ctx?.participant) num = ctx.participant.split('@')[0].replace(/[^0-9]/g, '');
        if (!num && Array.isArray(ctx?.mentionedJid) && ctx.mentionedJid.length) num = ctx.mentionedJid[0].split('@')[0].replace(/[^0-9]/g, '');
        if (!num) { await sock.sendMessage(jid, { text: '❌ Provide a number or reply/tag a user.' }); return; }
        const current = sudoFeature.listSudos();
        const already = current.includes(num);
        const ok = already ? false : sudoFeature.addSudo(num);
        const list = sudoFeature.listSudos();
        let targetMention = `${String(num)}@s.whatsapp.net`;
        let mentions = list.map(n => `${String(n)}@s.whatsapp.net`);
        try {
          if (jid.endsWith('@g.us')) {
            const meta = await sock.groupMetadata(jid);
            const parts = meta.participants || [];
            const match = parts.find(p => (p.id || '').includes(String(num)));
            if (match) targetMention = match.id;
            mentions = list.map(n => {
              const m2 = parts.find(p => (p.id || '').includes(String(n)));
              return m2 ? m2.id : `${String(n)}@s.whatsapp.net`;
            });
          }
        } catch {}
        const lines = mentions.map((m, i) => `${i + 1}. @${m.split('@')[0]}`);
        const head = already ? `ℹ️ Already sudo: @${targetMention.split('@')[0]}` : `✅ Added sudo: @${targetMention.split('@')[0]}`;
        const text = `${head}\n\n👑 *Sudo Users*\n\n${lines.join('\n')}`;
        const allMentions = Array.from(new Set([targetMention, ...mentions]));
        await sock.sendMessage(jid, { text, mentions: allMentions });
      });
      registerCommand('delsudo', 'Remove a sudo user (owner only)', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) { await sock.sendMessage(jid, { text: '❌ Owner only.' }); return; }
        let num = '';
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        if (args[0]) num = String(args[0]).replace(/[^0-9]/g, '');
        if (!num && ctx?.participant) num = ctx.participant.split('@')[0].replace(/[^0-9]/g, '');
        if (!num && Array.isArray(ctx?.mentionedJid) && ctx.mentionedJid.length) num = ctx.mentionedJid[0].split('@')[0].replace(/[^0-9]/g, '');
        if (!num) { await sock.sendMessage(jid, { text: '❌ Provide a number or reply/tag a user.' }); return; }
        const ok = sudoFeature.removeSudo(num);
        if (!ok) { await sock.sendMessage(jid, { text: 'ℹ️ Not found' }); return; }
        const list = sudoFeature.listSudos();
        let targetMention = `${String(num)}@s.whatsapp.net`;
        let mentions = list.map(n => `${String(n)}@s.whatsapp.net`);
        try {
          if (jid.endsWith('@g.us')) {
            const meta = await sock.groupMetadata(jid);
            const parts = meta.participants || [];
            const match = parts.find(p => (p.id || '').includes(String(num)));
            if (match) targetMention = match.id;
            mentions = list.map(n => {
              const m2 = parts.find(p => (p.id || '').includes(String(n)));
              return m2 ? m2.id : `${String(n)}@s.whatsapp.net`;
            });
          }
        } catch {}
        if (!list.length) {
          const text = `✅ Removed sudo: @${targetMention.split('@')[0]}\n\n👑 *Sudo Users*\n\nℹ️ No sudo users set.`;
          await sock.sendMessage(jid, { text, mentions: [targetMention] });
          return;
        }
        const lines = mentions.map((m, i) => `${i + 1}. @${m.split('@')[0]}`);
        const text = `✅ Removed sudo: @${targetMention.split('@')[0]}\n\n👑 *Sudo Users*\n\n${lines.join('\n')}`;
        const allMentions = Array.from(new Set([targetMention, ...mentions]));
        await sock.sendMessage(jid, { text, mentions: allMentions });
      });
      registerCommand('flirt', 'Send a random flirt message', async (sock, msg) => {
        const chatId = msg.key.remoteJid;
        await flirtCommand(sock, chatId, msg);
      });
      registerCommand('dare', 'Send a random dare', async (sock, msg) => {
        const chatId = msg.key.remoteJid;
        await dareCommand(sock, chatId, msg);
      });
      registerCommand('autostatus', 'Enable or disable auto status view/react', async (sock, msg, args) => {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) { await sock.sendMessage(msg.key.remoteJid, { text: `❌ Owner only.\n\n${CHANNEL_URL}` }); return; }
        await autoStatus.autoStatusCommand(sock, msg.key.remoteJid, msg, args);
      });

      // Register Meme Commands
      registerMemeCommands({ registerCommand, sock, config });
      
      // Register NSFW Commands
      registerNsfwCommands({ registerCommand, sock, config });
    }
    catch (e) {
      console.error('❌ Failed to register apk command:', e && e.message ? e.message : e);
    }

    return sock;
}

const sessionManager = new SessionManager();

async function showMenu() {
    console.log('\n╔════════════════════════════════════╗');
    console.log('║   🤖 FiazzyMD WhatsApp Bot Setup   ║');
    console.log('╚════════════════════════════════════╝\n');

    // Non-interactive bootstrap for PM2 or env-driven setups
    const envSessionName = process.env.SESSION_NAME || null;
    const envAuthMethod = (process.env.AUTH_METHOD || '').toLowerCase();
    const isNonInteractive = !!envSessionName || !process.stdin.isTTY || process.env.FORCE_NON_INTERACTIVE === 'true' || system.isManagedByPM2();
    let sessionPath;
    if (isNonInteractive) {
        const name = envSessionName || 'session1';
        sessionManager.currentSession = name;
        sessionPath = path.join(sessionManager.sessionsDir, name);
        try { if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true }); } catch {}
    } else {
        // Session selection
        sessionPath = await sessionManager.selectSession();
    }

    // Check if session already has credentials
    if (fs.existsSync(path.join(sessionPath, 'creds.json'))) {
        console.log('✅ Found existing credentials. Reconnecting...\n');
        return await connectToWhatsApp(false, sessionPath);
    }

    if (isNonInteractive) {
        const method = envAuthMethod === 'pair' ? 'pair' : 'qr';
        if (method === 'pair') {
            console.log('🔄 Starting Pairing Code authentication...\n');
            return await connectToWhatsApp(true, sessionPath);
        } else {
            console.log('🔄 Starting QR Code authentication...\n');
            return await connectToWhatsApp(false, sessionPath);
        }
    } else {
        console.log('Choose your connection method:\n');
        console.log('  1️⃣  QR Code (Scan with phone)');
        console.log('  2️⃣  Pairing Code (Enter code on phone)\n');
        const choice = await question('Enter your choice (1 or 2): ');
        console.log('');
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
}

// Start the bot
console.log('\n🚀 Starting FiazzyMD WhatsApp Bot...');

showMenu().catch(err => {
    console.error('❌ Error starting bot:', err);
    rl.close();
    process.exit(1);
});
    registerCommand('gemini', 'Gemini chatbot on/off/clearchat and prompt', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'on' || sub === 'off') {
            const senderJid = msg.key.participant || msg.key.remoteJid;
            const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
            const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
            const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
            if (!isOwner) {
                await sock.sendMessage(jid, { text: '❌ Only the bot owner can toggle Gemini.' });
                return;
            }
            const enable = sub === 'on';
            const ok = updateEnvFile('GEMINI_ENABLED', enable ? 'true' : 'false');
            if (ok) {
                process.env.GEMINI_ENABLED = enable ? 'true' : 'false';
                await sock.sendMessage(jid, { text: enable ? '✅ Gemini chat is now ON globally.' : '❌ Gemini chat is now OFF globally.' });
            } else {
                await sock.sendMessage(jid, { text: '❌ Failed to update .env for global Gemini toggle.' });
            }
            return;
        }
        if (sub === 'clearchat') { const cleared = gemini.clearChatHistory(jid); await sock.sendMessage(jid, { text: cleared ? '✅ Gemini chat session cleared.' : 'ℹ️ No active chat session found.' }); return; }
        const prompt = args.join(' ').trim();
        if (!prompt) { await sock.sendMessage(jid, { text: `💡 Provide a prompt or use ${config.prefix}gemini on/off/clearchat.` }); return; }
        if (!gemini.isChatEnabled(jid)) { await sock.sendMessage(jid, { text: `❌ Gemini chat is disabled globally. Use ${config.prefix}gemini on to enable.` }); return; }
        try { await sock.sendPresenceUpdate('composing', jid); } catch {}
        const response = await gemini.sendMessage(jid, prompt);
        try { await sock.sendPresenceUpdate('paused', jid); } catch {}
        await sock.sendMessage(jid, { text: response });
    });
    const presenceTargets = new Set();
    try {
        sock.ev.on('chats.set', ({ chats }) => {
            try { for (const c of chats) presenceTargets.add(c.id); } catch {}
        });
        sock.ev.on('chats.update', (updates) => {
            try { for (const u of updates) if (u.id) presenceTargets.add(u.id); } catch {}
        });
    } catch {}
    let presenceInterval = null;
    function startPresenceLoop(sockInstance) {
        const activeStates = new Set(['composing', 'recording', 'available']);
        if (presenceInterval) { try { clearInterval(presenceInterval); } catch {} }
        presenceInterval = setInterval(async () => {
            const currentState = (process.env.WAPRESENCE_STATE || 'paused').toLowerCase();
            if (!activeStates.has(currentState)) return;
            try {
                if (currentState === 'available') {
                    await sockInstance.sendPresenceUpdate('available');
                }
                for (const jid of presenceTargets) {
                    await sockInstance.sendPresenceUpdate(currentState, jid);
                }
            } catch (e) {}
        }, 20000);
    }
    registerCommand('alive', 'Show or set alive message for this chat', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const text = args.join(' ').trim();
        if (!text) {
            const message = alive.getAliveMessage();
            const formatted = `💫 *Fiazzy-MD Alive*\n\n${message}\n\n⚡ Powered by Fiazzy-MD`;
            await sock.sendMessage(jid, { text: formatted });
            return;
        }
        if (text.toLowerCase() === 'reset') {
            alive.clearAliveMessage();
            const formatted = `💫 *Fiazzy-MD Alive*\n\n${alive.DEFAULT_ALIVE}\n\n⚡ Powered by Fiazzy-MD`;
            await sock.sendMessage(jid, { text: formatted });
            return;
        }
        alive.setAliveMessage(null, text);
        await sock.sendMessage(jid, { text: `✅ Alive message updated globally.` });
    });

    registerCommand('wapresence', 'Set global WhatsApp presence (owner only)', async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        if (!isOwner) { await sock.sendMessage(jid, { text: '❌ Only the bot owner can use this command.' }); return; }
        const sub = (args[0] || '').toLowerCase();
        const state = presence.mapInputToState(sub);
        if (!state) { await sock.sendMessage(jid, { text: `❌ Invalid presence state. Use: ${config.prefix}wapresence <on|off|typing|recording|online>` }); return; }
        const ok = updateEnvFile('WAPRESENCE_STATE', state);
        if (ok) {
            process.env.WAPRESENCE_STATE = state;
            try {
                presenceTargets.add(jid);
                if (state === 'available') { await sock.sendPresenceUpdate('available'); }
                await sock.sendPresenceUpdate(state, jid);
            } catch {}
            await sock.sendMessage(jid, { text: `✅ Presence set to *${state.toUpperCase()}* globally.` });
        } else {
            await sock.sendMessage(jid, { text: '❌ Failed to update presence in .env' });
        }
    });
