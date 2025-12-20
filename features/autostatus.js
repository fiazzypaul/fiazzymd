const fs = require('fs');
const path = require('path');

const channelInfo = {
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

// Path to store auto status configuration
const configPath = path.join(__dirname, '../data/autoStatus.json');

const dataDir = path.join(__dirname, '..', 'data');
function ensureDataDir() { try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); } catch {} }
function readConfig() { try { if (fs.existsSync(configPath)) { return JSON.parse(fs.readFileSync(configPath)); } } catch {} return { enabled: false, reactOn: false }; }
function writeConfig(cfg) { try { ensureDataDir(); fs.writeFileSync(configPath, JSON.stringify(cfg)); } catch {} }

async function autoStatusCommand(sock, chatId, msg, args) {
    try {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const normalizedOwner = String(process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
        const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
        const isOwner = normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
        
        if (!msg.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command can only be used by the owner!\n\nhttps://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S',
                ...channelInfo
            });
            return;
        }

        let config = readConfig();

        // If no arguments, show current status
        if (!args || args.length === 0) {
            const status = config.enabled ? 'enabled' : 'disabled';
            const reactStatus = config.reactOn ? 'enabled' : 'disabled';
            await sock.sendMessage(chatId, { 
                text: `🔄 *Auto Status Settings*\n\n📱 *Auto Status View:* ${status}\n💫 *Status Reactions:* ${reactStatus}\n\n*Commands:*\n.autostatus on - Enable auto status view\n.autostatus off - Disable auto status view\n.autostatus react on - Enable status reactions\n.autostatus react off - Disable status reactions\n\nhttps://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S`,
                ...channelInfo
            });
            return;
        }

        // Handle on/off commands
        const command = args[0].toLowerCase();
        
        if (command === 'on') {
            config.enabled = true;
            writeConfig(config);
            await sock.sendMessage(chatId, { 
                text: '✅ Auto status view has been enabled!\nBot will now automatically view all contact statuses.\n\nhttps://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S',
                ...channelInfo
            });
        } else if (command === 'off') {
            config.enabled = false;
            writeConfig(config);
            await sock.sendMessage(chatId, { 
                text: '❌ Auto status view has been disabled!\nBot will no longer automatically view statuses.\n\nhttps://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S',
                ...channelInfo
            });
        } else if (command === 'react') {
            // Handle react subcommand
            if (!args[1]) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Please specify on/off for reactions!\nUse: .autostatus react on/off',
                    ...channelInfo
                });
                return;
            }
            
            const reactCommand = args[1].toLowerCase();
            if (reactCommand === 'on') {
                config.reactOn = true;
                writeConfig(config);
                await sock.sendMessage(chatId, { 
                    text: '💫 Status reactions have been enabled!\nBot will now react to status updates.\n\nhttps://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S',
                    ...channelInfo
                });
            } else if (reactCommand === 'off') {
                config.reactOn = false;
                writeConfig(config);
                await sock.sendMessage(chatId, { 
                    text: '❌ Status reactions have been disabled!\nBot will no longer react to status updates.\n\nhttps://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S',
                    ...channelInfo
                });
            } else {
                await sock.sendMessage(chatId, { 
                    text: '❌ Invalid reaction command! Use: .autostatus react on/off\n\nhttps://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S',
                    ...channelInfo
                });
            }
        } else {
            await sock.sendMessage(chatId, { 
                text: '❌ Invalid command! Use:\n.autostatus on/off - Enable/disable auto status view\n.autostatus react on/off - Enable/disable status reactions\n\nhttps://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S',
                ...channelInfo
            });
        }

    } catch (error) {
        console.error('Error in autostatus command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error occurred while managing auto status!\n' + error.message + '\n\nhttps://whatsapp.com/channel/0029Vb6vjvH1CYoRVJOHes3S',
            ...channelInfo
        });
    }
}

// Function to check if auto status is enabled
function isAutoStatusEnabled() { try { const c = readConfig(); return !!c.enabled; } catch { return false; } }

// Function to check if status reactions are enabled
function isStatusReactionEnabled() { try { const c = readConfig(); return !!c.reactOn; } catch { return false; } }

// Function to react to status using proper method
async function reactToStatus(sock, statusKey) {
    try {
        if (!isStatusReactionEnabled()) {
            return;
        }

        // Use the proper relayMessage method for status reactions
        await sock.relayMessage(
            'status@broadcast',
            {
                reactionMessage: {
                    key: {
                        remoteJid: 'status@broadcast',
                        id: statusKey.id,
                        participant: statusKey.participant || statusKey.remoteJid,
                        fromMe: false
                    },
                    text: '💚'
                }
            },
            {
                messageId: statusKey.id,
                statusJidList: [statusKey.remoteJid, statusKey.participant || statusKey.remoteJid]
            }
        );
        
        // Removed success log - only keep errors
    } catch (error) {
        console.error('❌ Error reacting to status:', error.message);
    }
}

// Function to handle status updates
async function handleStatusUpdate(sock, status) {
    try {
        if (!isAutoStatusEnabled()) {
            return;
        }

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Handle status from messages.upsert
        if (status.messages && status.messages.length > 0) {
            const msg = status.messages[0];
            if (msg.key && msg.key.remoteJid === 'status@broadcast') {
                try {
                    await sock.readMessages([msg.key]);
                    const sender = msg.key.participant || msg.key.remoteJid;
                    
                    // React to status if enabled
                    await reactToStatus(sock, msg.key);
                    
                    // Removed success log - only keep errors
                } catch (err) {
                    if (err.message?.includes('rate-overlimit')) {
                        console.log('⚠️ Rate limit hit, waiting before retrying...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        await sock.readMessages([msg.key]);
                    } else {
                        throw err;
                    }
                }
                return;
            }
        }

        // Handle direct status updates
        if (status.key && status.key.remoteJid === 'status@broadcast') {
            try {
                await sock.readMessages([status.key]);
                const sender = status.key.participant || status.key.remoteJid;
                
                // React to status if enabled
                await reactToStatus(sock, status.key);
                
                // Removed success log - only keep errors
            } catch (err) {
                if (err.message?.includes('rate-overlimit')) {
                    console.log('⚠️ Rate limit hit, waiting before retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await sock.readMessages([status.key]);
                } else {
                    throw err;
                }
            }
            return;
        }

        // Handle status in reactions
        if (status.reaction && status.reaction.key.remoteJid === 'status@broadcast') {
            try {
                await sock.readMessages([status.reaction.key]);
                const sender = status.reaction.key.participant || status.reaction.key.remoteJid;
                
                // React to status if enabled
                await reactToStatus(sock, status.reaction.key);
                
                // Removed success log - only keep errors
            } catch (err) {
                if (err.message?.includes('rate-overlimit')) {
                    console.log('⚠️ Rate limit hit, waiting before retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await sock.readMessages([status.reaction.key]);
                } else {
                    throw err;
                }
            }
            return;
        }

    } catch (error) {
        console.error('❌ Error in auto status view:', error.message);
    }
}

module.exports = {
    autoStatusCommand,
    handleStatusUpdate
};