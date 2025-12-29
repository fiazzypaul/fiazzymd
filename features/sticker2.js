const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const sharp = require('sharp');
const execPromise = util.promisify(exec);

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

const cleanUp = (files) => {
    files.forEach(file => {
        if (fs.existsSync(file)) {
            try {
                fs.unlinkSync(file);
            } catch (e) {
                console.error(`Failed to cleanup file ${file}:`, e);
            }
        }
    });
};

// Helper to convert animated WebP to MP4 using Sharp (extract frames) + FFmpeg (stitch)
// This bypasses FFmpeg's lack of animated WebP decoding support
const convertAnimatedWebPToMp4 = async (inputBuffer, outputFile) => {
    const frameDir = path.join(tempDir, `frames_${Date.now()}`);
    if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir);

    try {
        const metadata = await sharp(inputBuffer).metadata();
        const pages = metadata.pages;
        
        if (!pages || pages <= 1) {
            throw new Error('Not an animated WebP');
        }

        const delays = metadata.delay || [];
        const defaultDelay = 100; // 100ms default if missing
        
        // Create frames and concat list
        const concatFilePath = path.join(frameDir, 'concat.txt');
        let concatContent = '';

        for (let i = 0; i < pages; i++) {
            const frameFile = path.join(frameDir, `frame_${i.toString().padStart(5, '0')}.png`);
            
            await sharp(inputBuffer, { page: i })
                .png()
                .toFile(frameFile);

            const delayMs = delays[i] || defaultDelay;
            // FFmpeg concat duration is in seconds
            const durationSec = delayMs / 1000.0;
            
            // Format for concat demuxer:
            // file 'path'
            // duration 0.1
            // Escape backslashes for Windows if needed, but relative paths or forward slashes are safer.
            // Using absolute paths with forward slashes usually works best in ffmpeg.
            const safePath = frameFile.replace(/\\/g, '/');
            concatContent += `file '${safePath}'\n`;
            concatContent += `duration ${durationSec}\n`;
        }

        // Add the last file again without duration to ensure the last frame is shown? 
        // Actually for concat demuxer, the last file needs to be mentioned?
        // Standard practice: just list them.
        
        fs.writeFileSync(concatFilePath, concatContent);

        // Run FFmpeg to stitch
        // -f concat -safe 0 -i list.txt -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" output.mp4
        const command = `"${ffmpegPath}" -f concat -safe 0 -i "${concatFilePath}" -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -movflags faststart "${outputFile}"`;
        await execPromise(command);

    } finally {
        // Cleanup frames folder
        try {
            if (fs.existsSync(frameDir)) {
                fs.rmSync(frameDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.error('Failed to clean up frame dir:', e);
        }
    }
};

const handleSticker2 = async (sock, msg, args) => {
    const chatId = msg.key.remoteJid;
    
    // Get quoted message
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quotedMsg) {
        await sock.sendMessage(chatId, { text: '❌ Please reply to a sticker or gif with .sticker2' });
        return;
    }

    // Check if it's a sticker
    if (quotedMsg.stickerMessage) {
        const stickerMsg = quotedMsg.stickerMessage;
        const isAnimated = stickerMsg.isAnimated;
        
        await sock.sendMessage(chatId, { text: '⏳ Converting sticker...' });

        const inputFile = path.join(tempDir, `sticker_${Date.now()}.webp`);
        const outputFile = path.join(tempDir, `out_${Date.now()}.${isAnimated ? 'mp4' : 'png'}`);

        try {
            // Download
            const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            
            if (isAnimated) {
                // Use custom Sharp extraction -> FFmpeg stitch
                await convertAnimatedWebPToMp4(buffer, outputFile);
                
                await sock.sendMessage(chatId, { 
                    video: fs.readFileSync(outputFile),
                    caption: '✅ Sticker (Animated) → Video',
                    gifPlayback: false
                });
            } else {
                // Static: Use Sharp directly to convert to PNG (simpler/faster than ffmpeg spawn)
                await sharp(buffer).png().toFile(outputFile);
                
                await sock.sendMessage(chatId, { 
                    image: fs.readFileSync(outputFile),
                    caption: '✅ Sticker (Static) → Image'
                });
            }
        } catch (err) {
            console.error('Conversion error:', err);
            await sock.sendMessage(chatId, { text: `❌ Conversion failed: ${err.message}` });
        } finally {
            cleanUp([inputFile, outputFile]);
        }
        return;
    }

    // Check if it's a Video (Gif)
    // "Gif" in WhatsApp is usually a videoMessage with gifPlayback: true
    if (quotedMsg.videoMessage) {
        const videoMsg = quotedMsg.videoMessage;
        
        // If user wants "Gif to Video", it's trivial because it IS a video.
        // We just send it back as a normal video.
        
        await sock.sendMessage(chatId, { text: '⏳ Fetching video...' });
        
        try {
            const stream = await downloadContentFromMessage(videoMsg, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            
            await sock.sendMessage(chatId, { 
                video: buffer,
                caption: '✅ Gif → Video',
                gifPlayback: false // Ensure it's treated as video
            });
        } catch (err) {
            console.error('Video fetch error:', err);
            await sock.sendMessage(chatId, { text: `❌ Failed to process video: ${err.message}` });
        }
        return;
    }

    await sock.sendMessage(chatId, { text: '❌ Please reply to a sticker or gif (video).' });
};

module.exports = handleSticker2;
