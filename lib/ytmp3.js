const youtube = require('./youtube');

/**
 * Get YouTube audio download URL
 * @param {string} url - YouTube video URL or search query
 * @returns {Promise<Object>} { url, title, thumbnail, channel }
 */
async function ytmp3(url) {
    try {
        const result = await youtube.constructor.mp3(url);
        return result;
    } catch (error) {
        console.error('ytmp3 error:', error);
        throw new Error("Failed to get download URL: " + error.message);
    }
}

module.exports = ytmp3;
