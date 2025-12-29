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

// Waifu.pics NSFW Base URL
const BASE_URL = 'https://api.waifu.pics/nsfw';

const getNsfwMedia = async (category, count = 5) => {
    const urls = [];
    const requests = [];
    
    for (let i = 0; i < count; i++) {
        requests.push(axios.get(`${BASE_URL}/${category}`));
    }

    try {
        const results = await Promise.all(requests);
        results.forEach(response => {
            if (response.data && response.data.url) {
                urls.push(response.data.url);
            }
        });
    } catch (error) {
        console.error(`Error fetching NSFW media for ${category}:`, error);
    }
    
    return urls;
};

const convertGifToMp4 = async (gifUrl) => {
    const timestamp = Date.now() + Math.floor(Math.random() * 1000);
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

const registerNsfwCommands = ({ registerCommand, sock, config }) => {
    const commands = ['goon1', 'goon2'];

    commands.forEach(cmd => {
        const category = cmd === 'goon1' ? 'waifu' : 'neko';
        
        registerCommand(cmd, `Send 5 NSFW ${category} images/videos`, async (sock, msg, args) => {
            const chatId = msg.key.remoteJid;

            try {
                await sock.sendPresenceUpdate('composing', chatId);
                
                const urls = await getNsfwMedia(category, 5);
                
                if (urls.length === 0) {
                    await sock.sendMessage(chatId, { text: `❌ Failed to fetch content.` });
                    return;
                }

                for (const url of urls) {
                    const isGif = url.endsWith('.gif');
                    
                    if (isGif) {
                        try {
                            const { mp4Path, inputPath } = await convertGifToMp4(url);
                            await sock.sendMessage(chatId, { 
                                video: { url: mp4Path }, 
                                gifPlayback: true,
                                caption: `🔞 ${category}`
                            });
                            // Cleanup temp files immediately after sending
                            try { fs.unlinkSync(inputPath); } catch { }
                            try { fs.unlinkSync(mp4Path); } catch { }
                        } catch (e) {
                            console.error('Failed to convert/send GIF:', e);
                        }
                    } else {
                        await sock.sendMessage(chatId, { 
                            image: { url: url },
                            caption: `🔞 ${category}`
                        });
                    }
                }

            } catch (error) {
                console.error(`Error executing ${cmd}:`, error);
                await sock.sendMessage(chatId, { text: `❌ An error occurred.` });
            }
        });
    });
};

module.exports = registerNsfwCommands;
