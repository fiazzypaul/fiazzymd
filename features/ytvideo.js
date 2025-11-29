const yts = require('yt-search');
const ytmp4 = require('../lib/ytmp4');
const fs = require('fs');
const path = require('path');

// Store user search sessions
const searchSessions = new Map();

/**
 * Search YouTube for videos
 * @param {string} query - Search query
 * @param {number} limit - Number of results (default 5)
 * @returns {Promise<Array>} Search results
 */
async function searchYouTube(query, limit = 5) {
    try {
        const results = await yts(query);
        return results.videos.slice(0, limit);
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
    let message = '🎬 *YOUTUBE VIDEO SEARCH*\n\n';
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
    message += '💡 *Reply with a number (1-5) to download that video*';

    return message;
}

/**
 * Download YouTube video
 * @param {string} url - YouTube video URL
 * @param {string} title - Video title (for filename)
 * @returns {Promise<string>} Path to downloaded file
 */
async function downloadVideo(url, title) {
    try {
        const downloadsDir = path.join(__dirname, '..', 'downloads');
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }

        // Sanitize filename
        const sanitizedTitle = title
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);

        const outputPath = path.join(downloadsDir, `${sanitizedTitle}.mp4`);

        await ytmp4(url, outputPath);
        return outputPath;
    } catch (error) {
        console.error('Download error:', error);
        throw new Error('Failed to download video');
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
    return `🎬 *DOWNLOADING VIDEO*\n\n` +
           `📝 Title: ${title}\n\n` +
           `⏳ Please wait, downloading video...\n` +
           `📹 Quality: 360p MP4...`;
}

module.exports = {
    searchYouTube,
    formatSearchResults,
    downloadVideo,
    storeSearchSession,
    getSearchSession,
    clearSearchSession,
    formatDownloadMessage
};
