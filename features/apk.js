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
 * Search for an APK using David Cyril API
 * @param {string} query - APK name to search
 * @returns {Promise<Object>} APK details
 */
async function searchApk(query) {
    const url = `https://apis.davidcyril.name.ng/download/apk?text=${encodeURIComponent(query)}&apikey=`;
    try {
        const response = await axios.get(url, AXIOS_DEFAULTS);
        if (response.data && response.data.status && response.data.apk) {
            return response.data.apk;
        }
        throw new Error('APK not found or API error');
    } catch (error) {
        console.error('David Cyril APK API search error:', error.message);
        throw new Error('Failed to search for APK');
    }
}

/**
 * Download APK from direct URL
 * @param {string} url - Direct APK download URL
 * @param {string} name - APK name
 * @returns {Promise<Object>} { filePath, name, cleanup }
 */
async function downloadApk(url, name) {
    try {
        const safeName = name.replace(/[^\w\s-]/g, '').trim().substring(0, 100) || 'app';
        const timestamp = Date.now();
        const filename = `${safeName}_${timestamp}.apk`;
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
            name: name,
            cleanup: async () => {
                try {
                    if (fs.existsSync(filePath)) {
                        await fsPromises.unlink(filePath);
                    }
                } catch (err) {
                    console.error('Failed to delete APK file:', err);
                }
            }
        };
    } catch (error) {
        console.error('APK Download error:', error.message);
        throw new Error('Failed to download APK file');
    }
}

/**
 * Store search session for a user
 * @param {string} userId - User JID
 * @param {Object} result - APK search result
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
 * Format APK result for display
 * @param {Object} apk - APK details
 * @returns {string} Formatted message
 */
function formatApkResult(apk) {
    let message = `📦 *APK FOUND*\n\n`;
    message += `📝 *Name:* ${apk.name}\n`;
    message += `🆔 *Package:* ${apk.package}\n`;
    message += `🆙 *Last Updated:* ${apk.lastUpdated || 'Unknown'}\n\n`;
    message += `1️⃣ *Download APK*\n`;
    message += `2️⃣ *Cancel*\n\n`;
    message += `💡 *Reply with 1 or 2 to choose an option*`;
    return message;
}

module.exports = {
    searchApk,
    downloadApk,
    formatApkResult,
    storeSearchSession,
    getSearchSession,
    clearSearchSession
};
