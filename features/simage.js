const sharp = require('sharp');
const fs = require('fs');
const fsPromises = require('fs/promises');
const fse = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const tempDir = './temp';
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const scheduleFileDeletion = (filePath) => {
    setTimeout(async () => {
        try {
            await fse.remove(filePath);
            console.log(`File deleted: ${filePath}`);
        } catch (error) {
            console.error(`Failed to delete file:`, error);
        }
    }, 10000);
};

const convertStickerToImage = async (sock, quotedMessage, chatId) => {
    try {
        const stickerMessage = quotedMessage.stickerMessage;
        if (!stickerMessage) {
            await sock.sendMessage(chatId, { text: '❌ Reply to a sticker with .simage to convert it to image/video!' });
            return;
        }

        await sock.sendMessage(chatId, { text: '🔄 Converting sticker...\n⏳ Please wait...' });

        const isAnimated = stickerMessage.isAnimated;
        const stickerFilePath = path.join(tempDir, `sticker_${Date.now()}.webp`);

        // Download sticker
        const stream = await downloadContentFromMessage(stickerMessage, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        await fsPromises.writeFile(stickerFilePath, buffer);

        if (isAnimated) {
            // Convert animated sticker to MP4 video
            const outputVideoPath = path.join(tempDir, `converted_video_${Date.now()}.mp4`);

            await new Promise((resolve, reject) => {
                const ffmpegCmd = `ffmpeg -i "${stickerFilePath}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${outputVideoPath}"`;
                exec(ffmpegCmd, (error) => {
                    if (error) {
                        console.error('FFmpeg error:', error);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            const videoBuffer = await fsPromises.readFile(outputVideoPath);
            await sock.sendMessage(chatId, {
                video: videoBuffer,
                caption: '✅ *Animated Sticker → Video*\n\n💡 Powered by FiazzyMD',
                mimetype: 'video/mp4'
            });

            scheduleFileDeletion(stickerFilePath);
            scheduleFileDeletion(outputVideoPath);

        } else {
            // Convert static sticker to PNG image
            const outputImagePath = path.join(tempDir, `converted_image_${Date.now()}.png`);

            await sharp(stickerFilePath).toFormat('png').toFile(outputImagePath);

            const imageBuffer = await fsPromises.readFile(outputImagePath);
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: '✅ *Sticker → Image*\n\n💡 Powered by FiazzyMD'
            });

            scheduleFileDeletion(stickerFilePath);
            scheduleFileDeletion(outputImagePath);
        }

    } catch (error) {
        console.error('Error converting sticker:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Failed to convert sticker!\n\n💡 Error: ${error.message}\n\n*Requirements:*\n- Reply to a sticker\n- FFmpeg installed (for animated stickers)`
        });
    }
};

module.exports = convertStickerToImage;
