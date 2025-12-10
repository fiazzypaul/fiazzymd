const sharp = require('sharp');
const fs = require('fs');
const fsPromises = require('fs/promises');
const fse = require('fs-extra');
const path = require('path');
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
            // Animated stickers use animated WebP format which is not supported by FFmpeg's native decoder
            // Inform the user about this limitation
            await sock.sendMessage(chatId, {
                text: '⚠️ *Animated Sticker Detected*\n\n' +
                      '❌ Animated stickers cannot be converted to video because:\n\n' +
                      '• WhatsApp uses animated WebP format\n' +
                      '• FFmpeg does not support animated WebP decoding\n' +
                      '• The format uses unsupported chunks (ANIM/ANMF)\n\n' +
                      '💡 *Alternative:*\n' +
                      '• Use `.sticker` on a video/GIF to create animated stickers\n' +
                      '• Send regular stickers (non-animated) for conversion\n\n' +
                      'Sorry for the inconvenience!'
            });

            scheduleFileDeletion(stickerFilePath);
            return;

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
            text: `❌ Failed to convert sticker!\n\n💡 Error: ${error.message}\n\n*Requirements:*\n- Reply to a sticker (static stickers only)\n- Animated stickers are not supported`
        });
    }
};

module.exports = convertStickerToImage;
