/**
 * Update group profile picture
 * User must reply to an image with .gpp command
 * @param {Object} sock - WhatsApp socket connection
 * @param {Object} msg - Message object
 * @returns {Promise<boolean>} Success status
 */
async function updateGroupProfilePicture(sock, msg) {
    try {
        const jid = msg.key.remoteJid;

        // Check if it's a group
        if (!jid.endsWith('@g.us')) {
            await sock.sendMessage(jid, {
                text: '❌ This command only works in groups!'
            });
            return false;
        }

        // Get quoted message
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsg) {
            await sock.sendMessage(jid, {
                text: '❌ *Reply to an image* with .gpp to set it as group profile picture\n\n' +
                      '💡 Example: Reply to any image and type: .gpp'
            });
            return false;
        }

        // Check if quoted message has an image
        const imageMsg = quotedMsg.imageMessage;
        if (!imageMsg) {
            await sock.sendMessage(jid, {
                text: '❌ Please reply to an *image* message\n\n' +
                      '💡 The quoted message must contain an image'
            });
            return false;
        }

        // Check if user is admin
        const groupMetadata = await sock.groupMetadata(jid);
        const userJid = msg.key.participant || msg.key.remoteJid;
        const userParticipant = groupMetadata.participants.find(p => p.id === userJid);

        if (!userParticipant || (userParticipant.admin !== 'admin' && userParticipant.admin !== 'superadmin')) {
            await sock.sendMessage(jid, {
                text: '❌ Only group admins can change the profile picture!'
            });
            return false;
        }

        // Download the image
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(
            { message: quotedMsg },
            'buffer',
            {},
            {
                logger: console,
                reuploadRequest: sock.updateMediaMessage
            }
        );

        // Update group profile picture
        await sock.updateProfilePicture(jid, buffer);

        await sock.sendMessage(jid, {
            text: '✅ Group profile picture updated successfully!'
        });

        return true;

    } catch (error) {
        console.error('❌ Error updating group profile picture:', error);
        throw error;
    }
}

module.exports = {
    updateGroupProfilePicture
};
