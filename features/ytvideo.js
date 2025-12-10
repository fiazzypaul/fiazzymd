const youtube = require('../lib/youtube');
const ytmp4 = require('../lib/ytmp4');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

// Store user search sessions
const searchSessions = new Map();

// Store active downloads
const activeDownloads = new Map();

// Downloads directory
const downloadsDir = './downloads';
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

/**
 * Search YouTube for videos
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
 * Get YouTube video download data with background processing
 * @param {string} url - YouTube video URL
 * @param {string} title - Video title (for filename)
 * @param {string} downloadId - Unique download ID
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} { filePath, title, thumbnail, cleanup }
 */
async function downloadVideo(url, title, downloadId = null, progressCallback = null) {
    const dlId = downloadId || `dl_${Date.now()}`;

    try {
        // Get download link from API
        const result = await ytmp4(url);
        const downloadUrl = result.url;

        // Create safe filename
        const safeTitle = title.replace(/[^\w\s-]/g, '').trim().substring(0, 100);
        const timestamp = Date.now();
        const filename = `${safeTitle}_${timestamp}.mp4`;
        const filePath = path.join(downloadsDir, filename);

        // Track download
        activeDownloads.set(dlId, {
            filePath,
            title: result.title || title,
            progress: 0,
            status: 'downloading'
        });

        // Download to file with progress tracking
        console.log('📥 Downloading video to:', filePath);
        const response = await axios.get(downloadUrl, {
            responseType: 'stream',
            timeout: 600000, // 10 minutes for very large videos
            maxContentLength: 500 * 1024 * 1024, // 500MB limit
            onDownloadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    activeDownloads.get(dlId).progress = percentCompleted;

                    if (progressCallback && percentCompleted % 10 === 0) {
                        progressCallback(percentCompleted, progressEvent.loaded, progressEvent.total);
                    }
                }
            }
        });

        const totalSize = parseInt(response.headers['content-length'] || '0');
        let downloadedSize = 0;

        const writer = fs.createWriteStream(filePath);

        response.data.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (totalSize > 0) {
                const progress = Math.round((downloadedSize * 100) / totalSize);
                const download = activeDownloads.get(dlId);
                if (download) {
                    download.progress = progress;
                }
            }
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log('✅ Video downloaded successfully');

        // Update status
        const download = activeDownloads.get(dlId);
        if (download) {
            download.status = 'completed';
            download.progress = 100;
        }

        // Return file path and cleanup function
        return {
            filePath: filePath,
            title: result.title || title,
            thumbnail: result.thumbnail,
            downloadId: dlId,
            cleanup: async () => {
                try {
                    await fsPromises.unlink(filePath);
                    console.log('🗑️ Deleted:', filePath);
                    activeDownloads.delete(dlId);
                } catch (err) {
                    console.error('Failed to delete file:', err);
                }
            }
        };
    } catch (error) {
        console.error('Download error:', error);

        // Update status to failed
        const download = activeDownloads.get(dlId);
        if (download) {
            download.status = 'failed';
            download.error = error.message;
        }

        throw new Error('Failed to download video: ' + error.message);
    }
}

/**
 * Check if a download is active
 * @param {string} downloadId - Download ID
 * @returns {Object|null} Download status or null
 */
function getDownloadStatus(downloadId) {
    return activeDownloads.get(downloadId) || null;
}

/**
 * Cancel an active download
 * @param {string} downloadId - Download ID
 */
async function cancelDownload(downloadId) {
    const download = activeDownloads.get(downloadId);
    if (download && download.filePath) {
        try {
            await fsPromises.unlink(download.filePath);
        } catch (err) {
            console.error('Failed to delete file:', err);
        }
        activeDownloads.delete(downloadId);
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
           `📹 Quality: Best Available (up to 1080p)...`;
}

module.exports = {
    searchYouTube,
    formatSearchResults,
    downloadVideo,
    getDownloadStatus,
    cancelDownload,
    storeSearchSession,
    getSearchSession,
    clearSearchSession,
    formatDownloadMessage
};
