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
            // Convert animated sticker: WebP → GIF → MP4
            const gifPath = path.join(tempDir, `sticker_${Date.now()}.gif`);
            const outputVideoPath = path.join(tempDir, `converted_video_${Date.now()}.mp4`);

            // Step 1: Convert WebP to GIF using gif2webp in reverse (or ffmpeg with libwebp_anim)
            await new Promise((resolve, reject) => {
                // Use ffmpeg to convert webp to gif first
                const webpToGifCmd = `ffmpeg -i "${stickerFilePath}" -vf "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "${gifPath}"`;
                exec(webpToGifCmd, (error, stdout, stderr) => {
                    if (error) {
                        console.error('WebP to GIF conversion error:', error.message);
                        // If this fails, try direct conversion
                        const directCmd = `ffmpeg -i "${stickerFilePath}" "${gifPath}"`;
                        exec(directCmd, (err2) => {
                            if (err2) {
                                reject(error); // Use original error
                            } else {
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                });
            });

            // Step 2: Convert GIF to MP4
            await new Promise((resolve, reject) => {
                const gifToMp4Cmd = `ffmpeg -i "${gifPath}" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -preset fast "${outputVideoPath}"`;
                exec(gifToMp4Cmd, (error, stdout, stderr) => {
                    if (error) {
                        console.error('GIF to MP4 conversion error:', error.message);
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
            scheduleFileDeletion(gifPath);
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
