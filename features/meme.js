const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Get ffmpeg path
let ffmpegPath = null;
try {
    ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
} catch (e) {
    console.warn('ffmpeg-installer not found, relying on system ffmpeg');
    ffmpegPath = 'ffmpeg';
}

const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Waifu.pics Base URL (No API Key required)
const BASE_URL = 'https://api.waifu.pics/sfw';

const getWaifuGif = async (category) => {
    try {
        // Map commands to waifu.pics categories
        const categoryMap = {
            'kill': 'kill',
            'hug': 'hug',
            'kiss': 'kiss',
            'slap': 'slap',
            'punch': 'bonk',   // Mapped punch to bonk
            'party': 'dance',  // Mapped party to dance
            'winner': 'happy'  // Mapped winner to happy
        };

        const targetCategory = categoryMap[category] || category;
        const url = `${BASE_URL}/${targetCategory}`;
        
        const response = await axios.get(url);
        
        if (response.data && response.data.url) {
            return response.data.url;
        }
        return null;
    } catch (error) {
        console.error(`Error fetching GIF from waifu.pics for ${category}:`, error);
        return null;
    }
};

const convertGifToMp4 = async (gifUrl) => {
    const timestamp = Date.now();
    const inputPath = path.join(tempDir, `${timestamp}.gif`);
    const outputPath = path.join(tempDir, `${timestamp}.mp4`);

    try {
        // Download GIF
        const response = await axios.get(gifUrl, { 
            responseType: 'arraybuffer',
            headers: { 'Accept-Encoding': 'identity' }
        });
        fs.writeFileSync(inputPath, response.data);

        // Convert to MP4
        // -pix_fmt yuv420p is required for WhatsApp compatibility
        // -vf scale ensures even dimensions (divisible by 2)
        // -movflags faststart optimizes for streaming/playback
        const command = `"${ffmpegPath}" -i "${inputPath}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${outputPath}"`;
        
        await execPromise(command);
        
        return { mp4Path: outputPath, inputPath };
    } catch (error) {
        console.error('Error converting GIF to MP4:', error);
        // Cleanup on error
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw error;
    }
};

const registerMemeCommands = ({ registerCommand, sock, config }) => {
    const commands = ['kill', 'hug', 'kiss', 'slap', 'punch', 'party', 'winner'];

    commands.forEach(cmd => {
        registerCommand(cmd, `Send a ${cmd} GIF`, async (sock, msg, args) => {
            const chatId = msg.key.remoteJid;
            const senderJid = msg.key.participant || msg.key.remoteJid;
            const senderName = senderJid.split('@')[0];

            let targetJid = null;
            let targetName = null;

            // Check for reply
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
            if (quotedMsg?.participant) {
                targetJid = quotedMsg.participant;
                targetName = targetJid.split('@')[0];
            } 
            // Check for mentions
            else if (quotedMsg?.mentionedJid && quotedMsg.mentionedJid.length > 0) {
                targetJid = quotedMsg.mentionedJid[0];
                targetName = targetJid.split('@')[0];
            }
            // Check for args (numbers)
            else if (args.length > 0) {
                const cleanNum = args[0].replace(/[^0-9]/g, '');
                if (cleanNum) {
                    targetJid = `${cleanNum}@s.whatsapp.net`;
                    targetName = cleanNum;
                }
            }

            // Construct caption based on command type and target
            let caption = '';
            const mentions = [senderJid];
            if (targetJid) mentions.push(targetJid);

            switch (cmd) {
                case 'party':
                    caption = `🎉 @${senderName} is partying!`;
                    break;
                case 'winner':
                    caption = targetJid 
                        ? `🏆 @${senderName} declares @${targetName} the winner!` 
                        : `🏆 @${senderName} is the winner!`;
                    break;
                case 'kill':
                    caption = targetJid 
                        ? `🔪 @${senderName} killed @${targetName}!` 
                        : `🔪 @${senderName} chose violence!`;
                    break;
                case 'hug':
                    caption = targetJid 
                        ? `🫂 @${senderName} hugged @${targetName}!` 
                        : `🫂 @${senderName} needs a hug!`;
                    break;
                case 'kiss':
                    caption = targetJid 
                        ? `💋 @${senderName} kissed @${targetName}!` 
                        : `💋 @${senderName} blew a kiss!`;
                    break;
                case 'slap':
                    caption = targetJid 
                        ? `👋 @${senderName} slapped @${targetName}!` 
                        : `👋 @${senderName} is slapping everyone!`;
                    break;
                case 'punch':
                    caption = targetJid 
                        ? `👊 @${senderName} punched @${targetName}!` 
                        : `👊 @${senderName} is throwing punches!`;
                    break;
                case 'cry':
                    caption = targetJid 
                        ? `😢 @${senderName} is crying over @${targetName}!` 
                        : `😢 @${senderName} is crying!`;
                    break;
                case 'bite':
                    caption = targetJid 
                        ? `🦷 @${senderName} bit @${targetName}!` 
                        : `🦷 @${senderName} is biting!`;
                    break;
                case 'happy':
                    caption = targetJid 
                        ? `😄 @${senderName} is happy with @${targetName}!` 
                        : `😄 @${senderName} is happy!`;
                    break;
                case 'pat':
                    caption = targetJid 
                        ? `👋 @${senderName} patted @${targetName}!` 
                        : `👋 @${senderName} is patting!`;
                    break;
                default:
                    caption = `✨ @${senderName} used ${cmd}!`;
            }

            // Send composing presence
            try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

            try {
                // Fetch GIF URL
                const gifUrl = await getWaifuGif(cmd);

                if (gifUrl) {
                    // Convert GIF to MP4
                    const { mp4Path, inputPath } = await convertGifToMp4(gifUrl);

                    // Send as video with gifPlayback: true
                    await sock.sendMessage(chatId, { 
                        video: { url: mp4Path },
                        caption: caption,
                        gifPlayback: true,
                        mentions: mentions
                    });

                    // Cleanup temp files
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(mp4Path);
                } else {
                    await sock.sendMessage(chatId, { text: `❌ Failed to find a ${cmd} GIF.` });
                }
            } catch (error) {
                console.error(`Error executing ${cmd}:`, error);
                await sock.sendMessage(chatId, { text: `❌ An error occurred while processing the GIF.` });
            }
        });
    });
};

module.exports = registerMemeCommands;
