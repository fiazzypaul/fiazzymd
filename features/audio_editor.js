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
 * @param {Buffer} buffer - Input media buffer
 * @param {Object|Array} options - Processing options. Can be array of filters (legacy) or options object.
 * @param {boolean} isVideo - Is input video
 */
const processAudio = (buffer, options, isVideo = false) => {
    return new Promise((resolve, reject) => {
        const tempInput = path.join(process.cwd(), 'temp', `input_${Date.now()}_${Math.random().toString(36).substring(7)}.${isVideo ? 'mp4' : 'mp3'}`);
        const tempOutput = path.join(process.cwd(), 'temp', `output_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);

        // Ensure temp directory exists
        if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
            fs.mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
        }

        fs.writeFileSync(tempInput, buffer);

        const ffmpegCommand = ffmpeg(tempInput);

        // Handle legacy filter array
        let filters = [];
        let startTime = null;
        let duration = null;

        if (Array.isArray(options)) {
            filters = options;
        } else if (typeof options === 'object') {
            filters = options.filters || [];
            startTime = options.startTime;
            duration = options.duration;
        }

        // Apply start time (seeking)
        if (startTime) {
            ffmpegCommand.setStartTime(startTime);
        }

        // Apply duration/end
        if (duration) {
            ffmpegCommand.setDuration(duration);
        }

        ffmpegCommand
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

/**
 * Helper to parse time string to seconds
 * Supports: "1.30" (1m30s), "90" (90s), "1:30" (1m30s)
 * Rule: If "." is present, treat as MM.SS. If no ".", treat as seconds.
 */
const parseTime = (input) => {
    if (!input) return null;
    input = String(input).trim();
    
    // Check for MM:SS
    if (input.includes(':')) {
        const parts = input.split(':');
        const mins = parseInt(parts[0] || '0');
        const secs = parseInt(parts[1] || '0');
        return (mins * 60) + secs;
    }

    // Check for MM.SS (User specific rule: dot implies minutes)
    if (input.includes('.')) {
        const parts = input.split('.');
        const mins = parseInt(parts[0] || '0');
        const secs = parseInt(parts[1] || '0');
        return (mins * 60) + secs;
    }
    
    // Treat as raw seconds if just a number (no dot)
    return parseFloat(input);
};

const cut = async (sock, msg, args) => {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quotedMsg || (!quotedMsg.audioMessage && !quotedMsg.videoMessage)) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please reply to an audio or video message with .cut start,end (e.g., .cut 1.0,1.30)` });
        return;
    }

    // Parse args
    // Users might use comma or space
    // .cut 1.0,1.30 -> args=["1.0,1.30"]
    // .cut 1.0 1.30 -> args=["1.0", "1.30"]
    let startStr, endStr;
    const fullArgs = args.join(' ');
    
    if (fullArgs.includes(',')) {
        [startStr, endStr] = fullArgs.split(',');
    } else {
        startStr = args[0];
        endStr = args[1];
    }

    const startTime = parseTime(startStr);
    const endTime = parseTime(endStr);

    if (startTime === null || endTime === null || isNaN(startTime) || isNaN(endTime)) {
         await sock.sendMessage(msg.key.remoteJid, { text: `❌ Invalid time format. Use .cut start,end (e.g. .cut 1.0,1.30 for 1m to 1m30s)` });
         return;
    }

    if (startTime >= endTime) {
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Start time must be less than end time.` });
        return;
    }

    const duration = endTime - startTime;

    await sock.sendMessage(msg.key.remoteJid, { text: `✂️ Cutting audio from ${startTime}s to ${endTime}s (Duration: ${duration}s)...` });

    try {
        let mediaMsg = quotedMsg.audioMessage ? quotedMsg : quotedMsg.videoMessage ? quotedMsg : null;
         // Handle view once
         if (quotedMsg.viewOnceMessage || quotedMsg.viewOnceMessageV2) {
            const inner = quotedMsg.viewOnceMessage?.message || quotedMsg.viewOnceMessageV2?.message;
            if (inner.audioMessage || inner.videoMessage) mediaMsg = inner;
       }

        const buffer = await downloadMedia(mediaMsg);
        const isVideo = !!(mediaMsg.videoMessage);

        const processedBuffer = await processAudio(buffer, {
            startTime: startTime,
            duration: duration
        }, isVideo);

        await sock.sendMessage(msg.key.remoteJid, {
            audio: processedBuffer,
            mimetype: 'audio/mpeg',
            ptt: false
        }, { quoted: msg });

    } catch (error) {
        console.error('Cut audio error:', error);
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to cut audio: ${error.message}` });
    }
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

module.exports = { bass, speed, cut };
