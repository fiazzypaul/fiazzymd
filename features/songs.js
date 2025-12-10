const youtube = require('../lib/youtube');
const ytmp3 = require('../lib/ytmp3');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

// Store user search sessions
const searchSessions = new Map();

// Downloads directory
const downloadsDir = './downloads';
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

/**
 * Search YouTube for songs
 * @param {string} query - Search query
 * @param {number} limit - Number of results (default 5)
 * @returns {Promise<Array>} Search results
 */
async function searchYouTube(query, limit = 5) {
    try {
        const results = await youtube.search(query);
        return results.slice(0, limit);
    } catch (error) {
        console.error('YouTube search error:', error);
        throw new Error('Failed to search YouTube');
    }
}

/**
 * Format search results for display
 * @param {Array} results - Search results
 * @param {string} query - Original search query
 * @returns {string} Formatted message
 */
function formatSearchResults(results, query) {
    let message = '🎵 *YOUTUBE SONG SEARCH*\n\n';
    message += `📝 Query: "${query}"\n`;
    message += `📊 Found ${results.length} results\n\n`;
    message += '━━━━━━━━━━━━━━━━━━━━\n\n';

    results.forEach((video, index) => {
        const duration = formatDuration(video.timestamp);
        message += `*${index + 1}.* ${video.title}\n`;
        message += `   👤 ${video.author.name}\n`;
        message += `   ⏱️ ${duration}\n`;
        message += `   👁️ ${formatViews(video.views)}\n\n`;
    });

    message += '━━━━━━━━━━━━━━━━━━━━\n\n';
    message += '💡 *Reply with a number (1-5) to download that song*';

    return message;
}

/**
 * Get YouTube audio download data
 * @param {string} url - YouTube video URL
 * @param {string} title - Video title (for filename)
 * @returns {Promise<Object>} { filePath, title, thumbnail, channel, cleanup }
 */
async function downloadAudio(url, title) {
    try {
        // Get download link from API
        const result = await ytmp3(url);
        const downloadUrl = result.url;

        // Create safe filename
        const safeTitle = title.replace(/[^\w\s-]/g, '').trim().substring(0, 100);
        const timestamp = Date.now();
        const filename = `${safeTitle}_${timestamp}.mp3`;
        const filePath = path.join(downloadsDir, filename);

        // Download to file
        console.log('📥 Downloading audio to:', filePath);
        const response = await axios.get(downloadUrl, {
            responseType: 'stream',
            timeout: 120000, // 2 minutes
            maxContentLength: 100 * 1024 * 1024 // 100MB limit
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log('✅ Audio downloaded successfully');

        // Return file path and cleanup function
        return {
            filePath: filePath,
            title: result.title || title,
            thumbnail: result.thumbnail,
            channel: result.channel,
            cleanup: async () => {
                try {
                    await fsPromises.unlink(filePath);
                    console.log('🗑️ Deleted:', filePath);
                } catch (err) {
                    console.error('Failed to delete file:', err);
                }
            }
        };
    } catch (error) {
        console.error('Download error:', error);
        throw new Error('Failed to download audio');
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
 * Format duration string
 */
function formatDuration(timestamp) {
    return timestamp || 'Unknown';
}

/**
 * Format view count
 */
function formatViews(views) {
    if (views >= 1000000) {
        return `${(views / 1000000).toFixed(1)}M views`;
    } else if (views >= 1000) {
        return `${(views / 1000).toFixed(1)}K views`;
    }
    return `${views} views`;
}

/**
 * Format download progress message
 */
function formatDownloadMessage(title) {
    return `🎵 *DOWNLOADING SONG*\n\n` +
           `📝 Title: ${title}\n\n` +
           `⏳ Please wait, downloading audio...\n` +
           `🎧 Converting to MP3 format...`;
}

module.exports = {
    searchYouTube,
    formatSearchResults,
    downloadAudio,
    storeSearchSession,
    getSearchSession,
    clearSearchSession,
    formatDownloadMessage
};
