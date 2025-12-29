const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

// Use global ffmpeg
// ffmpeg.setFfmpegPath(require('ffmpeg-static')); 


/**
 * Helper to download and save media
 */
const downloadMedia = async (msg) => {
    const buffer = await downloadMediaMessage(
        { message: msg },
        'buffer',
        {},
        { logger: console }
    );
    return buffer;
};

/**
 * Helper to process audio with ffmpeg
 */
const processAudio = (buffer, filters, isVideo = false) => {
    return new Promise((resolve, reject) => {
        const tempInput = path.join(process.cwd(), 'temp', `input_${Date.now()}_${Math.random().toString(36).substring(7)}.${isVideo ? 'mp4' : 'mp3'}`);
        const tempOutput = path.join(process.cwd(), 'temp', `output_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);

        // Ensure temp directory exists
        if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
            fs.mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
        }

        fs.writeFileSync(tempInput, buffer);

        const ffmpegCommand = ffmpeg(tempInput)
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .format('mp3');

        if (filters && filters.length > 0) {
            ffmpegCommand.audioFilters(filters);
        }

        ffmpegCommand
            .on('end', () => {
                const outputBuffer = fs.readFileSync(tempOutput);
                // Cleanup
                try {
                    fs.unlinkSync(tempInput);
                    fs.unlinkSync(tempOutput);
                } catch (e) {
                    console.error('Error deleting temp files:', e);
                }
                resolve(outputBuffer);
            })
            .on('error', (err) => {
                // Cleanup
                try {
                    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
                } catch (e) {}
                reject(err);
            })
            .save(tempOutput);
    });
};

const bass = async (sock, msg, args) => {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quotedMsg || (!quotedMsg.audioMessage && !quotedMsg.videoMessage)) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please reply to an audio or video message` });
        return;
    }

    let level = args[0] ? args[0].replace('%', '') : '10'; // Default to 10% if no arg provided? Or maybe 20? 
    // The user found previous default (20dB) too high.
    // If I default to '10', that's 10% -> 2dB. Very subtle.
    // Maybe default to 50% (10dB)? 
    // Let's force user to provide value or default to a safe 25% (5dB).
    
    // Actually, let's look at args.
    if (!args[0]) {
         // If no args, maybe default to 25%?
         level = '25';
    }

    let val = parseFloat(level);
    if (isNaN(val)) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Invalid value. Usage: .bass 20 or .bass 20%` });
        return;
    }

    // Clamp value between 0 and 100 (or slightly more if they really want)
    if (val < 0) val = 0;
    if (val > 200) val = 200; // Cap at 200% just in case

    // Map 0-100% to 0-20dB
    // 100% = 20dB
    // 1% = 0.2dB
    const gain = (val / 100) * 20;

    await sock.sendMessage(msg.key.remoteJid, { text: `🔊 Boosting bass by ${val}% (${gain.toFixed(1)}dB)...` });

    try {
        let mediaMsg = quotedMsg.audioMessage ? quotedMsg : quotedMsg.videoMessage ? quotedMsg : null;
        // Handle view once
        if (quotedMsg.viewOnceMessage || quotedMsg.viewOnceMessageV2) {
             const inner = quotedMsg.viewOnceMessage?.message || quotedMsg.viewOnceMessageV2?.message;
             if (inner.audioMessage || inner.videoMessage) mediaMsg = inner;
        }

        const buffer = await downloadMedia(mediaMsg);
        const isVideo = !!(mediaMsg.videoMessage);

        const processedBuffer = await processAudio(buffer, [`bass=g=${gain}`], isVideo);

        await sock.sendMessage(msg.key.remoteJid, {
            audio: processedBuffer,
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: msg });

    } catch (error) {
        console.error('Bass boost error:', error);
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to boost bass: ${error.message}` });
    }
};

const speed = async (sock, msg, args) => {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quotedMsg || (!quotedMsg.audioMessage && !quotedMsg.videoMessage)) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please reply to an audio or video message with speed <amount>` });
        return;
    }

    const speedArg = args[0] ? args[0].replace('x', '') : null;
    const speedVal = parseFloat(speedArg);

    if (!speedVal || isNaN(speedVal) || speedVal <= 0) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please provide a valid speed (e.g., speed 1.5)` });
        return;
    }

    if (speedVal > 4 || speedVal < 0.25) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Speed must be between 0.25x and 4x` });
        return;
    }

    await sock.sendMessage(msg.key.remoteJid, { text: `⏩ Changing speed to ${speedVal}x...` });

    try {
        let mediaMsg = quotedMsg.audioMessage ? quotedMsg : quotedMsg.videoMessage ? quotedMsg : null;
         // Handle view once
         if (quotedMsg.viewOnceMessage || quotedMsg.viewOnceMessageV2) {
            const inner = quotedMsg.viewOnceMessage?.message || quotedMsg.viewOnceMessageV2?.message;
            if (inner.audioMessage || inner.videoMessage) mediaMsg = inner;
       }

        const buffer = await downloadMedia(mediaMsg);
        const isVideo = !!(mediaMsg.videoMessage);

        // Construct atempo filters
        // atempo filter is limited to [0.5, 2.0]
        let filters = [];
        let currentSpeed = speedVal;

        while (currentSpeed > 2.0) {
            filters.push('atempo=2.0');
            currentSpeed /= 2.0;
        }
        while (currentSpeed < 0.5) {
            filters.push('atempo=0.5');
            currentSpeed /= 0.5;
        }
        if (currentSpeed !== 1.0) {
            filters.push(`atempo=${currentSpeed}`);
        }

        const processedBuffer = await processAudio(buffer, filters, isVideo);

        await sock.sendMessage(msg.key.remoteJid, {
            audio: processedBuffer,
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: msg });

    } catch (error) {
        console.error('Speed change error:', error);
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to change speed: ${error.message}` });
    }
};

module.exports = { bass, speed };
