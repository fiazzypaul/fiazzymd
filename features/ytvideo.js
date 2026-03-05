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
        'Referer': 'https://apis.davidcyril.name.ng/endpoints/search.html'
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
 * Search YouTube using David Cyril API
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
async function searchYouTube(query) {
    const url = `https://apis.davidcyril.name.ng/youtube/search?query=${encodeURIComponent(query)}`;
    try {
        const response = await axios.get(url, AXIOS_DEFAULTS);
        if (response.data && response.data.status && response.data.results) {
            return response.data.results;
        }
        throw new Error('No results found or API error');
    } catch (error) {
        console.error('David Cyril YouTube search error:', error.message);
        throw new Error('Failed to search YouTube');
    }
}

/**
 * Get MP3 download URL from David Cyril API
 * @param {string} videoUrl - YouTube video URL
 * @returns {Promise<Object>} Download data
 */
async function getMp3DownloadUrl(videoUrl) {
    const url = `https://apis.davidcyril.name.ng/youtube/mp3?url=${encodeURIComponent(videoUrl)}&apikey=`;
    try {
        const response = await axios.get(url, AXIOS_DEFAULTS);
        if (response.data && (response.data.status || response.data.success) && response.data.result) {
            return response.data.result;
        }
        throw new Error('Failed to get download URL');
    } catch (error) {
        console.error('David Cyril MP3 API error:', error.message);
        throw new Error('Failed to get MP3 download link');
    }
}

/**
 * Download file from direct URL
 * @param {string} url - Direct download URL
 * @param {string} title - File title
 * @param {string} ext - File extension (default .mp3)
 * @returns {Promise<Object>} { filePath, title, cleanup }
 */
async function downloadFile(url, title, ext = '.mp3') {
    try {
        const safeTitle = title.replace(/[^\w\s-]/g, '').trim().substring(0, 100) || 'file';
        const timestamp = Date.now();
        const filename = `${safeTitle}_${timestamp}${ext}`;
        const filePath = path.join(downloadsDir, filename);

        const response = await axios.get(url, {
            responseType: 'stream',
            timeout: 120000,
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
        throw new Error('Failed to download file');
    }
}

/**
 * Store search session for a user
 * @param {string} userId - User JID
 * @param {Array} results - Search results
 */
function storeSearchSession(userId, results) {
    searchSessions.set(userId, {
        results: results,
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
 * Format search results for display
 * @param {Array} results - Search results
 * @param {string} query - Original search query
 * @returns {string} Formatted message
 */
function formatSearchResults(results, query) {
    let message = '🎬 *YOUTUBE SEARCH*\n\n';
    message += `📝 *Query:* "${query}"\n\n`;

    results.forEach((item, index) => {
        message += `*${index + 1}.* ${item.title}\n`;
        message += `   ⏱️ *Duration:* ${item.duration}\n`;
        message += `   👤 *Author:* YouTube\n\n`;
    });

    message += '━━━━━━━━━━━━━━━━━━━━\n\n';
    message += '💡 *Reply with a number (1-10) to download*';

    return message;
}

/**
 * Get MP4 download URL from David Cyril API
 * @param {string} videoUrl - YouTube video URL
 * @returns {Promise<Object>} Download data
 */
async function getMp4DownloadUrl(videoUrl) {
    const url = `https://apis.davidcyril.name.ng/youtube/mp4?url=${encodeURIComponent(videoUrl)}&apikey=`;
    try {
        const response = await axios.get(url, AXIOS_DEFAULTS);
        if (response.data && (response.data.status || response.data.success) && response.data.result) {
            return response.data.result;
        }
        throw new Error('Failed to get video download URL');
    } catch (error) {
        console.error('David Cyril MP4 API error:', error.message);
        throw new Error('Failed to get MP4 download link');
    }
}

module.exports = {
    searchYouTube,
    getMp3DownloadUrl,
    getMp4DownloadUrl,
    downloadFile,
    storeSearchSession,
    getSearchSession,
    clearSearchSession,
    formatSearchResults
};
