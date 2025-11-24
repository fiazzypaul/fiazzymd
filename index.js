require('dotenv').config();
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

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

// Command Registry
const commands = new Map();

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

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Chrome (Linux)', 'Chrome', '121.0.0'],
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 45000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        getMessage: async () => undefined,
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
            console.log('💡 Bot is active and ready to respond to commands!\n');

            // Optional: Send welcome message after 20 seconds (disabled by default to prevent 500 errors)
            // Uncomment the code below if you want to enable welcome messages
            /*
            console.log('⏳ Will send welcome message in 20 seconds...\n');
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
                }
            }, 20000); // Wait 20 seconds before sending first message
            */
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Helper function to check if chat is a group
    const isGroup = (jid) => jid.endsWith('@g.us');

    // Helper function to check if bot is admin
    const isBotAdmin = async (sock, groupJid) => {
        try {
            const groupMetadata = await sock.groupMetadata(groupJid);
            const botNumber = sock.user.id.split(':')[0];
            const botJid = botNumber + '@s.whatsapp.net';
            const participant = groupMetadata.participants.find(p => p.id === botJid);
            return participant?.admin === 'admin' || participant?.admin === 'superadmin';
        } catch {
            return false;
        }
    };

    // Helper function to check if user is admin
    const isUserAdmin = async (sock, groupJid, userJid) => {
        try {
            const groupMetadata = await sock.groupMetadata(groupJid);
            const participant = groupMetadata.participants.find(p => p.id === userJid);
            return participant?.admin === 'admin' || participant?.admin === 'superadmin';
        } catch {
            return false;
        }
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
╰──────────────────────╯

╭──────────────────────╮
│  ⚙️ *GENERAL COMMANDS*  │
╰──────────────────────╯
│ ${config.prefix}ping
│ ${config.prefix}help
│ ${config.prefix}session
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

        if (!(await isBotAdmin(sock, msg.key.remoteJid))) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Bot is not admin! Please make the bot admin first.'
            });
        }

        if (!(await isUserAdmin(sock, msg.key.remoteJid, msg.key.participant || msg.key.remoteJid))) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only admins can use this command!'
            });
        }

        if (args.length === 0) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Usage: ${config.prefix}add <number>\n\nExample: ${config.prefix}add 2349012345678`
            });
        }

        const number = args[0].replace(/[^0-9]/g, '');
        if (!number) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Please provide a valid phone number!'
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

        if (!(await isBotAdmin(sock, msg.key.remoteJid))) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Bot is not admin! Please make the bot admin first.'
            });
        }

        if (!(await isUserAdmin(sock, msg.key.remoteJid, msg.key.participant || msg.key.remoteJid))) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only admins can use this command!'
            });
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
                text: `❌ Usage: Reply to a message with ${config.prefix}kick or use ${config.prefix}kick <number>`
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

        if (!(await isBotAdmin(sock, msg.key.remoteJid))) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Bot is not admin! Please make the bot admin first.'
            });
        }

        if (!(await isUserAdmin(sock, msg.key.remoteJid, msg.key.participant || msg.key.remoteJid))) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only admins can use this command!'
            });
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
                text: `❌ Usage: Reply to a message with ${config.prefix}promote or use ${config.prefix}promote <number>`
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

        if (!(await isBotAdmin(sock, msg.key.remoteJid))) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Bot is not admin! Please make the bot admin first.'
            });
        }

        if (!(await isUserAdmin(sock, msg.key.remoteJid, msg.key.participant || msg.key.remoteJid))) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only admins can use this command!'
            });
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
                text: `❌ Usage: Reply to a message with ${config.prefix}demote or use ${config.prefix}demote <number>`
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
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Get sender number
        const senderNumber = msg.key.remoteJid.split('@')[0];
        const isOwner = senderNumber === config.ownerNumber;

        // Check permissions: Owner can always use, others only in public mode
        if (!isOwner && config.botMode === 'private') {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is restricted to bot owner in private mode!'
            });
        }

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
        if (!isGroup(msg.key.remoteJid)) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is only for groups!'
            });
        }

        // Get sender number
        const senderNumber = msg.key.remoteJid.split('@')[0];
        const isOwner = senderNumber === config.ownerNumber;

        // Check permissions: Owner can always use, others only in public mode
        if (!isOwner && config.botMode === 'private') {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is restricted to bot owner in private mode!'
            });
        }

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

            console.log('📩 New message from:', msg.key.remoteJid);

            // Extract message text using universal extractor
            const messageText = extractMessageText(msg.message).trim();

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

            // Get sender number
            const senderNumber = msg.key.remoteJid.split('@')[0];

            // Check bot mode and permissions
            if (config.botMode === 'private') {
                if (senderNumber !== config.ownerNumber) {
                    console.log(`❌ Unauthorized access attempt from: ${senderNumber}`);
                    return;
                }
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
