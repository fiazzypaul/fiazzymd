const youtube = require('./youtube');

/**
 * Get YouTube video download URL
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} { url, title, thumbnail }
 */
async function ytmp4(url) {
    try {
        const result = await youtube.getVideo(url);
        return result;
    } catch (error) {
        console.error('ytmp4 error:', error);
        throw new Error("Failed to get download URL: " + error.message);
    }
}

module.exports = ytmp4;
