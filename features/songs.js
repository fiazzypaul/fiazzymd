const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

// UA for API requests
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'identity',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://apis.davidcyril.name.ng/endpoints/download.html'
    }
};

// Store user search sessions
const searchSessions = new Map();

// Downloads directory
const downloadsDir = './downloads';
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

/**
 * Search for a song using David Cyril API
 * @param {string} query - Search query
 * @returns {Promise<Object>} Search result
 */
async function searchSong(query) {
    const url = `https://apis.davidcyril.name.ng/song?query=${encodeURIComponent(query)}&apikey=`;
    try {
        const response = await axios.get(url, AXIOS_DEFAULTS);
        if (response.data && response.data.status && response.data.result) {
            return response.data.result;
        }
        throw new Error('Song not found or API error');
    } catch (error) {
        console.error('David Cyril API search error:', error.message);
        throw new Error('Failed to search for song');
    }
}

/**
 * Download song from direct URL
 * @param {string} url - Direct MP3 download URL
 * @param {string} title - Song title
 * @returns {Promise<Object>} { filePath, title, cleanup }
 */
async function downloadSong(url, title) {
    try {
        const safeTitle = title.replace(/[^\w\s-]/g, '').trim().substring(0, 100) || 'song';
        const timestamp = Date.now();
        const filename = `${safeTitle}_${timestamp}.mp3`;
        const filePath = path.join(downloadsDir, filename);

        const response = await axios.get(url, {
            responseType: 'stream',
            timeout: 60000,
            headers: {
                'User-Agent': UA,
                'Accept': '*/*',
                'Accept-Encoding': 'identity'
            }
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        return {
            filePath: filePath,
            title: title,
            cleanup: async () => {
                try {
                    if (fs.existsSync(filePath)) {
                        await fsPromises.unlink(filePath);
                    }
                } catch (err) {
                    console.error('Failed to delete file:', err);
                }
            }
        };
    } catch (error) {
        console.error('Download error:', error.message);
        throw new Error('Failed to download audio');
    }
}

/**
 * Store search session for a user
 * @param {string} userId - User JID
 * @param {Object} result - API search result
 */
function storeSearchSession(userId, result) {
    searchSessions.set(userId, {
        result: result,
        timestamp: Date.now()
    });

    // Auto-clear session after 5 minutes
    setTimeout(() => {
        searchSessions.delete(userId);
    }, 5 * 60 * 1000);
}

/**
 * Get search session for a user
 * @param {string} userId - User JID
 * @returns {Object|null} Search session or null
 */
function getSearchSession(userId) {
    return searchSessions.get(userId) || null;
}

/**
 * Clear search session for a user
 * @param {string} userId - User JID
 */
function clearSearchSession(userId) {
    searchSessions.delete(userId);
}

/**
 * Format search result for display
 * @param {Object} result - API search result
 * @returns {string} Formatted message
 */
function formatSearchResult(result) {
    let message = `🎵 *SONG FOUND*\n\n`;
    message += `📝 *Title:* ${result.title}\n`;
    message += `⏱️ *Duration:* ${result.duration || 'Unknown'}\n`;
    message += `👁️ *Views:* ${result.views?.toLocaleString() || 'Unknown'}\n\n`;
    message += `1️⃣ *Download MP3*\n`;
    message += `2️⃣ *Cancel*\n\n`;
    message += `💡 *Reply with 1 or 2 to choose an option*`;
    return message;
}

module.exports = {
    searchSong,
    downloadSong,
    formatSearchResult,
    storeSearchSession,
    getSearchSession,
    clearSearchSession
};
