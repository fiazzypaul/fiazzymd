require('dotenv').config();
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const createPermissions = require('./permissions');

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

// Initialize auto view-once from .env
if (process.env.AUTO_VIEW_ONCE === 'true') {
    autoViewOnceChats.add('global');
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

    // Handle pairing code BEFORE connection events - Official Baileys approach
    if (usePairingCode && !sock.authState.creds.registered) {
        const phoneNumber = await question('\n📱 Enter your WhatsApp phone number:\n   (with country code, no + or spaces)\n   Example: 2349012345678\n\n   Number: ');
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');

        if (!cleanNumber || cleanNumber.length < 10) {
            console.error('\n❌ Invalid phone number format');
            console.log('💡 Number must be in E.164 format without +');
            console.log('   Example: 2349012345678 (not +234 901 234 5678)\n');
            rl.close();
            process.exit(1);
        }

        console.log('\n🔄 Requesting pairing code for:', cleanNumber);
        try {
            const code = await sock.requestPairingCode(cleanNumber);
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
            console.log('⏳ Waiting for connection... (Bot will auto-connect)\n');
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
            console.log('💡 Bot is active and ready to respond to commands!\n');

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

        // Get sender number
        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
        const isOwner = senderNumber === config.ownerNumber;

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
│  📌 *BOT INFORMATION*  │
╰─────────────────────╯
│ *Prefix:* ${config.prefix}
│ *Mode:* ${config.botMode.toUpperCase()}
│ *Commands:* ${commands.size}
│ *Version:* ${config.botVersion}
╰─────────────────────╯

╭──────────────────────╮
│  👥 *GROUP COMMANDS*  │
╰──────────────────────╯
│ ${config.prefix}add
│ ${config.prefix}kick
│ ${config.prefix}promote
│ ${config.prefix}demote
│ ${config.prefix}tag
│ ${config.prefix}tagall
│ ${config.prefix}mute
│ ${config.prefix}unmute
│ ${config.prefix}warn
│ ${config.prefix}resetwarn
╰──────────────────────╯

╭──────────────────────╮
│  ⚙️ *GENERAL COMMANDS*  │
╰──────────────────────╯
│ ${config.prefix}ping
│ ${config.prefix}help
│ ${config.prefix}session
│ ${config.prefix}vv
╰──────────────────────╯

╭──────────────────────╮
│  🧩 *VAR COMMANDS*     │
╰──────────────────────╯
│ ${config.prefix}autoviewonce
│ ${config.prefix}warnlimit
│ ${config.prefix}antilink
╰──────────────────────╯

💡 Type ${config.prefix}help <command> for details

${config.botMode === 'private' ? '🔒 Private Mode - Owner Only' : '🌐 Public Mode - Everyone'}`;

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
                    caption: menuText
                });
                console.log('✅ Menu sent successfully with image');
            } else {
                // Send text only if image doesn't exist
                console.log('📤 Sending menu as text (no image found)...');
                await sock.sendMessage(msg.key.remoteJid, { text: menuText });
                console.log('✅ Menu sent successfully as text');
            }
        } catch (error) {
            // Fallback to text if image fails
            console.error('⚠️  Failed to send menu with image:', error.message);
            console.log('📤 Fallback: Sending menu as text...');
            await sock.sendMessage(msg.key.remoteJid, { text: menuText });
            console.log('✅ Menu sent successfully as text (fallback)');
        }
    });

    // Group Commands
    registerCommand('add', 'Add a member to the group', async (sock, msg, args) => {
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Get sender number
        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
        const isOwner = senderNumber === config.ownerNumber;

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

        if (args.length === 0) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: `📖 *How to use ${config.prefix}add*\n\n` +
                      `*Description:* Add a member to the group\n\n` +
                      `*Usage:* ${config.prefix}add <number>\n\n` +
                      `*Example:*\n${config.prefix}add 2349012345678\n\n` +
                      `💡 Include country code without + or spaces`
            });
        }

        const number = args[0].replace(/[^0-9]/g, '');
        if (!number) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Please provide a valid phone number!\n\n` +
                      `*Example:* ${config.prefix}add 2349012345678`
            });
        }

        try {
            await sock.groupParticipantsUpdate(msg.key.remoteJid, [`${number}@s.whatsapp.net`], 'add');
            await sock.sendMessage(msg.key.remoteJid, {
                text: `✅ Successfully added +${number} to the group!`
            });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to add member: ${error.message}`
            });
        }
    });

    registerCommand('kick', 'Remove a member from the group', async (sock, msg, args) => {
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Get sender number
        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
        const isOwner = senderNumber === config.ownerNumber;

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

        let targetJid;

        // Check if replying to a message
        if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (args.length > 0) {
            const number = args[0].replace(/[^0-9]/g, '');
            targetJid = `${number}@s.whatsapp.net`;
        } else {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: `📖 *How to use ${config.prefix}kick*\n\n` +
                      `*Description:* Remove a member from the group\n\n` +
                      `*Usage:*\n` +
                      `• Reply to their message with ${config.prefix}kick\n` +
                      `• Or use ${config.prefix}kick <number>\n\n` +
                      `*Examples:*\n` +
                      `1. Reply to someone's message: ${config.prefix}kick\n` +
                      `2. ${config.prefix}kick 2349012345678`
            });
        }

        try {
            await sock.groupParticipantsUpdate(msg.key.remoteJid, [targetJid], 'remove');
            await sock.sendMessage(msg.key.remoteJid, {
                text: `✅ Successfully removed @${targetJid.split('@')[0]} from the group!`,
                mentions: [targetJid]
            });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to remove member: ${error.message}`
            });
        }
    });

    registerCommand('promote', 'Promote a member to admin', async (sock, msg, args) => {
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Get sender number
        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
        const isOwner = senderNumber === config.ownerNumber;

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

        let targetJid;

        // Check if replying to a message
        if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (args.length > 0) {
            const number = args[0].replace(/[^0-9]/g, '');
            targetJid = `${number}@s.whatsapp.net`;
        } else {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: `📖 *How to use ${config.prefix}promote*\n\n` +
                      `*Description:* Promote a member to admin\n\n` +
                      `*Usage:*\n` +
                      `• Reply to their message with ${config.prefix}promote\n` +
                      `• Or use ${config.prefix}promote <number>\n\n` +
                      `*Examples:*\n` +
                      `1. Reply to someone's message: ${config.prefix}promote\n` +
                      `2. ${config.prefix}promote 2349012345678`
            });
        }

        try {
            await sock.groupParticipantsUpdate(msg.key.remoteJid, [targetJid], 'promote');
            await sock.sendMessage(msg.key.remoteJid, {
                text: `✅ Successfully promoted @${targetJid.split('@')[0]} to admin!`,
                mentions: [targetJid]
            });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to promote member: ${error.message}`
            });
        }
    });

    registerCommand('demote', 'Demote an admin to member', async (sock, msg, args) => {
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Get sender number
        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
        const isOwner = senderNumber === config.ownerNumber;

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

        let targetJid;

        // Check if replying to a message
        if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (args.length > 0) {
            const number = args[0].replace(/[^0-9]/g, '');
            targetJid = `${number}@s.whatsapp.net`;
        } else {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: `📖 *How to use ${config.prefix}demote*\n\n` +
                      `*Description:* Demote an admin to member\n\n` +
                      `*Usage:*\n` +
                      `• Reply to their message with ${config.prefix}demote\n` +
                      `• Or use ${config.prefix}demote <number>\n\n` +
                      `*Examples:*\n` +
                      `1. Reply to someone's message: ${config.prefix}demote\n` +
                      `2. ${config.prefix}demote 2349012345678`
            });
        }

        try {
            await sock.groupParticipantsUpdate(msg.key.remoteJid, [targetJid], 'demote');
            await sock.sendMessage(msg.key.remoteJid, {
                text: `✅ Successfully demoted @${targetJid.split('@')[0]} to member!`,
                mentions: [targetJid]
            });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to demote member: ${error.message}`
            });
        }
    });

    registerCommand('tag', 'Tag all members with a message', async (sock, msg, args) => {
        let tagMessage = args.join(' ');

        // Check if replying to a message
        if (!tagMessage && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedText = msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation ||
                              msg.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text;
            tagMessage = quotedText || 'Tagged by admin';
        }

        if (!tagMessage) {
            tagMessage = 'Tagged by admin';
        }

        try {
            const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
            const participants = groupMetadata.participants.map(p => p.id);

            await sock.sendMessage(msg.key.remoteJid, {
                text: `📢 *${tagMessage}*`,
                mentions: participants
            });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to tag members: ${error.message}`
            });
        }
    });

    registerCommand('tagall', 'List all members with tags', async (sock, msg) => {
        try {
            const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
            const participants = groupMetadata.participants;

            let text = `╭─────────────────────╮\n`;
            text += `│  👥 *GROUP MEMBERS*  │\n`;
            text += `╰─────────────────────╯\n\n`;

            participants.forEach((participant, index) => {
                text += `${index + 1}. @${participant.id.split('@')[0]}\n`;
            });

            text += `\n*Total Members:* ${participants.length}`;

            await sock.sendMessage(msg.key.remoteJid, {
                text: text,
                mentions: participants.map(p => p.id)
            });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Failed to list members: ${error.message}`
            });
        }
    });

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
        }

        // Check all view-once variants
        if (x.viewOnceMessageV2 && x.viewOnceMessageV2.message) {
            console.log('✅ unwrapViewOnce: Found viewOnceMessageV2');
            return x.viewOnceMessageV2.message;
        }

        if (x.viewOnceMessage && x.viewOnceMessage.message) {
            console.log('✅ unwrapViewOnce: Found viewOnceMessage');
            return x.viewOnceMessage.message;
        }

        if (x.viewOnceMessageV2Extension && x.viewOnceMessageV2Extension.message) {
            console.log('✅ unwrapViewOnce: Found viewOnceMessageV2Extension');
            return x.viewOnceMessageV2Extension.message;
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

            // First try: direct quotedMessage
            if (ctx.quotedMessage) {
                console.log('✅ Found quoted message via contextInfo.quotedMessage');
                return ctx.quotedMessage;
            }

            // Second try: stanzaId lookup in messageStore
            const stanzaId = ctx.stanzaId || ctx.stanzaIdV2 || ctx.quotedStanzaID;
            if (stanzaId) {
                const loaded = messageStore.get(`${msg.key.remoteJid}:${stanzaId}`);
                if (loaded) {
                    console.log('✅ Found quoted message via stanzaId:', stanzaId);
                    return loaded;
                }
            }
        }

        console.log('❌ No quoted message found');
        return null;
    };

    registerCommand('vv', 'Open and resend a view-once media', async (sock, msg) => {
        console.log('🔍 VV Command Debug:');
        console.log('Message keys:', Object.keys(msg));
        console.log('Message.message keys:', msg.message ? Object.keys(msg.message) : 'none');

        const quotedMsg = getQuotedMessage(msg);
        console.log('Quoted message:', quotedMsg ? 'Found' : 'Not found');

        if (!quotedMsg) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Please reply to a view-once message with ${config.prefix}vv`
            });
            return;
        }

        // Check if it's actually a view-once message
        const hasViewOnce = quotedMsg.viewOnceMessage || quotedMsg.viewOnceMessageV2 || quotedMsg.viewOnceMessageV2Extension;
        if (!hasViewOnce) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ That's not a view-once message!\n\n💡 The message you replied to is a regular ${Object.keys(quotedMsg)[0] || 'message'}`
            });
            return;
        }

        const inner = unwrapViewOnce(quotedMsg);
        console.log('View-once unwrapped:', inner ? 'Yes' : 'No');

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
            } else {
                console.log('❌ Unsupported media type');
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Unsupported view-once media type` });
            }
        } catch (error) {
            console.error('❌ VV Error:', error);
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to open view-once: ${error.message}` });
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

    registerCommand('mute', 'Mute the group', async (sock, msg, args) => {
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Get sender number
        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
        const isOwner = senderNumber === config.ownerNumber;

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
    });

    registerCommand('unmute', 'Unmute the group', async (sock, msg) => {
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Get sender number
        const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
        const isOwner = senderNumber === config.ownerNumber;

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
    });

    registerCommand('warn', 'Warn a user in the group', async (sock, msg, args) => {
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
    });

    registerCommand('resetwarn', 'Reset warnings for a user', async (sock, msg, args) => {
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
    });

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

    registerCommand('help', 'Show command details', async (sock, msg, args) => {
        if (args.length === 0) {
            const commandList = Array.from(commands.entries())
                .map(([name, { description }]) => `• *${config.prefix}${name}* - ${description}`)
                .join('\n');

            const helpText = `🤖 *${config.botName} Help*\n\n${commandList}\n\n💡 Use ${config.prefix}help <command> for specific command info`;
            await sock.sendMessage(msg.key.remoteJid, { text: helpText });
        } else {
            const cmdName = args[0].toLowerCase();
            const cmd = commands.get(cmdName);

            if (cmd) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `📖 *Command: ${config.prefix}${cmdName}*\n\n${cmd.description}`
                });
            } else {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `❌ Command "${cmdName}" not found.\n\nUse ${config.prefix}menu to see all commands.`
                });
            }
        }
    });

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

    registerCommand('warnlimit', 'Set warn limit for this group', async (sock, msg, args) => {
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
    });

    registerCommand('antilink', 'Toggle anti-link for this chat', async (sock, msg, args) => {
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
    });

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
            const msg = m.messages[0];
            if (!msg.message) return;

            const preText = extractMessageText(msg.message).trim();
            if (msg.key.fromMe && !preText.startsWith(config.prefix)) return;

            console.log('📩 New message from:', msg.key.remoteJid);

            try {
                const id = msg.key.id || '';
                const k = `${msg.key.remoteJid}:${id}`;
                if (!messageStore.has(k)) messageStore.set(k, msg.message);
            } catch {}

            const incomingVOMsg = unwrapViewOnce(msg.message);
            const autoVOEnabled = process.env.AUTO_VIEW_ONCE === 'true' || autoViewOnceChats.has('global');
            if (!msg.key.fromMe && autoVOEnabled && incomingVOMsg) {
                try {
                    const buffer = await downloadMediaMessage({ message: incomingVOMsg }, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    if (incomingVOMsg.imageMessage) {
                        await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption: 'Opened view-once 👀' });
                    } else if (incomingVOMsg.videoMessage) {
                        await sock.sendMessage(msg.key.remoteJid, { video: buffer, caption: 'Opened view-once 👀' });
                    }
                } catch {}
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

            console.log('💬 Message:', messageText);
            console.log('🔍 Prefix:', config.prefix);
            console.log('🔍 Starts with prefix?', messageText.startsWith(config.prefix));

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
