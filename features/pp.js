const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

async function updateBotProfilePicture(sock, msg, config) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
    const normalizedSender = sender.split('@')[0].replace(/[^0-9]/g, '');
    
    // Check if message is from me, or if sender is the owner
    // This handles LIDs (Logical IDs) and standard JIDs
    const isOwner = msg.key.fromMe || 
                    normalizedSender === normalizedOwner || 
                    sender.includes(normalizedOwner);

    if (!isOwner) {
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Only the bot owner can use this command!' });
        return;
    }

    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg || !quotedMsg.imageMessage) {
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Please reply to an image with .pp' });
        return;
    }

    try {
        const buffer = await downloadMediaMessage(
            { message: quotedMsg },
            'buffer',
            {},
            { logger: console, reuploadRequest: sock.updateMediaMessage }
        );

        const botJid = jidNormalizedUser(sock.user.id);
        await sock.updateProfilePicture(botJid, buffer);
        await sock.sendMessage(msg.key.remoteJid, { text: '✅ Bot profile picture updated!' });
    } catch (e) {
        console.error('Error updating profile picture:', e);
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Error: ${e.message}` });
    }
}

module.exports = function registerOwnerCommands({ registerCommand, sock, config }) {
    registerCommand('pp', 'Set bot profile picture (Owner only)', async (sock, msg, args) => {
        await updateBotProfilePicture(sock, msg, config);
    });
};
