const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// UA and common headers
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

/**
 * Upload buffer to tmpfile.link
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Filename
 * @returns {Promise<string>} Download link
 */
async function uploadToTmpFile(buffer, filename) {
    const form = new FormData();
    form.append('file', buffer, { filename });

    try {
        const response = await axios.post('https://tmpfile.link/api/upload', form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': UA,
                'Referer': 'https://tmpfile.link/',
                'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"iOS"'
            }
        });

        if (response.data && response.data.downloadLinkEncoded) {
            return response.data.downloadLinkEncoded;
        }
        throw new Error('Upload failed: Invalid response format');
    } catch (error) {
        console.error('❌ TmpFile Upload failed:', error.message);
        throw new Error('Failed to upload audio for identification');
    }
}

/**
 * Identify song using David Cyril Shazam API
 * @param {string} audioUrl - Public URL to audio file
 * @returns {Promise<Object>} Identified song details
 */
async function identifyWithShazam(audioUrl) {
    const url = `https://apis.davidcyril.name.ng/shazam?url=${encodeURIComponent(audioUrl)}`;
    
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Encoding': 'identity',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"iOS"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'none',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1'
            }
        });

        if (response.data && response.data.success && response.data.result) {
            return response.data.result;
        } else if (response.data && response.data.success === false) {
            throw new Error(response.data.message || 'No match found.');
        }
        throw new Error('Shazam identification failed or API error');
    } catch (error) {
        console.error('❌ David Cyril Shazam API error:', error.message);
        throw error;
    }
}

/**
 * Main Shazam command handler
 */
async function shazamCommand(sock, msg) {
    const chatId = msg.key.remoteJid;
    
    // Check if it's a reply to audio
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const isAudio = quoted?.audioMessage || msg.message?.audioMessage;
    const isVideo = quoted?.videoMessage || msg.message?.videoMessage;

    if (!isAudio && !isVideo) {
        return await sock.sendMessage(chatId, {
            text: "🔍 *SHAZAM*\n\nPlease reply to an *audio* or *video* file with *.shazam* to identify the song."
        });
    }

    try {
        await sock.sendMessage(chatId, { text: "⏳ Identifying song... Please wait." });

        // Download media
        const targetMsg = quoted ? { message: quoted } : msg;
        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
        
        // Upload to tmpfile
        const filename = `shazam_${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`;
        const publicUrl = await uploadToTmpFile(buffer, filename);

        // Identify
        const result = await identifyWithShazam(publicUrl);

        // Format message
        let caption = `🎵 *SHAZAM IDENTIFIED*\n\n`;
        caption += `📝 *Title:* ${result.title}\n`;
        caption += `👤 *Subtitle:* ${result.subtitle || result.artist}\n`;
        caption += `🎤 *Artist:* ${result.artist}\n`;
        caption += `💿 *Album:* ${result.album || 'Unknown'}\n`;
        caption += `🎼 *Genre:* ${result.genre || 'Unknown'}\n`;
        caption += `📅 *Release Date:* ${result.release_date || 'Unknown'}\n\n`;
        caption += `🔗 *Shazam:* ${result.shazam_url}\n\n`;
        caption += `💡 *Powered by FiazzyMD*`;

        // Send result with cover image
        if (result.cover) {
            await sock.sendMessage(chatId, {
                image: { url: result.cover },
                caption: caption
            }, { quoted: msg });
        } else {
            await sock.sendMessage(chatId, { text: caption }, { quoted: msg });
        }

    } catch (error) {
        console.error('Shazam command error:', error);
        let errorMsg = "❌ Failed to identify song.";
        
        if (error.message === 'No match found.') {
            errorMsg = "❌ No match found for this audio.";
        } else if (error.message.includes('upload')) {
            errorMsg = "❌ Failed to process audio for identification.";
        }

        await sock.sendMessage(chatId, { text: errorMsg });
    }
}

module.exports = {
    shazamCommand
};
