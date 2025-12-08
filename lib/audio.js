const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

/**
 * Extract audio from video and convert to MP3
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 */
async function extractAudioToMp3(sock, msg) {
    try {
        // Check if message is a reply to a video
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsg || (!quotedMsg.videoMessage && !quotedMsg.audioMessage)) {
            return sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Please reply to a video or audio message to extract/convert to MP3!"
            });
        }

        await sock.sendMessage(msg.key.remoteJid, {
            text: "⏳ Extracting audio to MP3..."
        });

        // Download the media
        const buffer = await downloadMediaMessage(
            { message: quotedMsg },
            'buffer',
            {}
        );

        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), 'temp');
        try {
            await fs.mkdir(tempDir, { recursive: true });
        } catch (e) {
            // Directory might already exist
        }

        const inputFile = path.join(tempDir, `input_${Date.now()}.${quotedMsg.videoMessage ? 'mp4' : 'ogg'}`);
        const outputFile = path.join(tempDir, `output_${Date.now()}.mp3`);

        // Write buffer to file
        await fs.writeFile(inputFile, buffer);

        // Use ffmpeg to extract audio and convert to MP3
        await execPromise(`ffmpeg -i "${inputFile}" -vn -acodec libmp3lame -q:a 2 "${outputFile}"`);

        // Read the output file
        const audioBuffer = await fs.readFile(outputFile);

        // Send the MP3 audio
        await sock.sendMessage(msg.key.remoteJid, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: 'audio.mp3'
        });

        // Clean up temp files
        await fs.unlink(inputFile).catch(() => {});
        await fs.unlink(outputFile).catch(() => {});

    } catch (err) {
        console.error('❌ MP3 extraction error:', err);
        return sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Error extracting audio: " + err.message + "\n\n💡 Make sure FFmpeg is installed on your system."
        });
    }
}

/**
 * Reverse audio or video
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 */
async function reverseMedia(sock, msg) {
    try {
        // Check if message is a reply to video or audio
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quotedMsg || (!quotedMsg.videoMessage && !quotedMsg.audioMessage)) {
            return sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Please reply to a video or audio message to reverse it!"
            });
        }

        const isVideo = !!quotedMsg.videoMessage;

        await sock.sendMessage(msg.key.remoteJid, {
            text: `⏳ Reversing ${isVideo ? 'video' : 'audio'}...`
        });

        // Download the media
        const buffer = await downloadMediaMessage(
            { message: quotedMsg },
            'buffer',
            {}
        );

        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), 'temp');
        try {
            await fs.mkdir(tempDir, { recursive: true });
        } catch (e) {
            // Directory might already exist
        }

        const inputFile = path.join(tempDir, `input_${Date.now()}.${isVideo ? 'mp4' : 'ogg'}`);
        const outputFile = path.join(tempDir, `output_${Date.now()}.${isVideo ? 'mp4' : 'mp3'}`);

        // Write buffer to file
        await fs.writeFile(inputFile, buffer);

        // Use ffmpeg to reverse the media
        if (isVideo) {
            // Reverse video with audio
            await execPromise(`ffmpeg -i "${inputFile}" -vf reverse -af areverse "${outputFile}"`);
        } else {
            // Reverse audio only
            await execPromise(`ffmpeg -i "${inputFile}" -af areverse "${outputFile}"`);
        }

        // Read the output file
        const reversedBuffer = await fs.readFile(outputFile);

        // Send the reversed media
        if (isVideo) {
            await sock.sendMessage(msg.key.remoteJid, {
                video: reversedBuffer,
                caption: "🔄 *Video Reversed*\n\n💡 Powered by FiazzyMD"
            });
        } else {
            await sock.sendMessage(msg.key.remoteJid, {
                audio: reversedBuffer,
                mimetype: 'audio/mpeg',
                fileName: 'reversed_audio.mp3',
                ptt: false
            });
        }

        // Clean up temp files
        await fs.unlink(inputFile).catch(() => {});
        await fs.unlink(outputFile).catch(() => {});

    } catch (err) {
        console.error('❌ Reverse media error:', err);
        return sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Error reversing media: " + err.message + "\n\n💡 Make sure FFmpeg is installed on your system."
        });
    }
}

module.exports = {
    extractAudioToMp3,
    reverseMedia
};
