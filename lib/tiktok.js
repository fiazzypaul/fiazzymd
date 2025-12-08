const axios = require("axios");

/**
 * Download TikTok video using local SnapTik server
 * @param {string} url - TikTok URL
 * @returns {Promise<string>} Direct MP4 download link
 */
async function tiktokDL(url) {
    const endpoint = `http://localhost:3030/tiktok?url=${encodeURIComponent(url)}`;
    const { data } = await axios.get(endpoint, { timeout: 20000 });

    if (!data.status) throw new Error(data.error || 'Failed to download');

    return data.download; // direct mp4 link
}

/**
 * Download TikTok video and send to user
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} url - TikTok URL
 */
async function tiktokDownloader(sock, msg, url) {
    try {
        if (!url || !url.includes("tiktok.com")) {
            return sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Please enter a valid TikTok URL."
            });
        }

        // Show downloading message
        await sock.sendMessage(msg.key.remoteJid, {
            text: "⏳ Downloading TikTok video..."
        });

        // Get download link from local SnapTik server
        const downloadUrl = await tiktokDL(url);

        console.log('📥 Downloading TikTok video from:', downloadUrl);

        // Download the video
        const videoBuffer = (await axios.get(downloadUrl, {
            responseType: "arraybuffer",
            timeout: 30000
        })).data;

        // Send video to user
        return sock.sendMessage(msg.key.remoteJid, {
            video: videoBuffer,
            caption: "🎥 *TikTok Video Downloaded*\n\n💡 Powered by FiazzyMD"
        });

    } catch (err) {
        console.error('❌ TikTok download error:', err);
        return sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Error downloading TikTok: " + err.message + "\n\n💡 Make sure the link is valid and the video is public."
        });
    }
}

module.exports = tiktokDownloader;
