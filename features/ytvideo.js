const youtube = require('../lib/youtube');
const ytmp4 = require('../lib/ytmp4');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { PassThrough } = require('stream');
const execPromise = promisify(exec);

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
 * Get video info and download URL (for streaming mode)
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} { downloadUrl, title, thumbnail, size }
 */
async function getVideoInfo(url) {
    const result = await ytmp4(url);
    return {
        downloadUrl: result.url,
        title: result.title,
        thumbnail: result.thumbnail,
        size: 0,
        sizeMB: 0
    };
}

/**
 * Stream video directly from URL without saving to disk
 * @param {string} url - Direct download URL
 * @returns {Promise<Object>} { stream, size }
 */
async function streamVideo(url) {
    try {
        const response = await axios({
            url: url,
            method: 'GET',
            responseType: 'stream',
            timeout: 600000, // 10 minutes
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        const size = parseInt(response.headers['content-length'] || '0');
        const stream = new PassThrough();

        response.data.pipe(stream);

        return { stream, size };
    } catch (error) {
        console.error('Stream error:', error);
        throw new Error('Failed to stream video: ' + error.message);
    }
}

/**
 * Get YouTube video download data with background processing (OLD METHOD - saves to disk)
 * @param {string} url - YouTube video URL
 * @param {string} title - Video title (for filename)
 * @param {string} downloadId - Unique download ID
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} { filePath, title, thumbnail, cleanup }
 */
async function downloadVideo(url, title, downloadId = null, progressCallback = null) {
    const dlId = downloadId || `dl_${Date.now()}`;

    try {
        // Get download link with simple retry
        let result;
        let attempt = 0;
        let lastErr = null;
        while (attempt < 3) {
            try {
                result = await ytmp4(url);
                break;
            } catch (e) {
                lastErr = e;
                attempt++;
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
        if (!result) throw lastErr || new Error('Failed to get download URL');
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
            timeout: 900000,
            maxContentLength: Infinity,
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

/**
 * Split video into parts using ffmpeg
 * @param {string} inputPath - Path to input video
 * @param {number} partSizeMB - Size of each part in MB (default 100MB)
 * @returns {Promise<Array<string>>} Array of part file paths
 */
async function splitVideo(inputPath, partSizeMB = 100) {
    try {
        // Get video duration
        const { stdout: durationOutput } = await execPromise(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
        );
        const totalDuration = parseFloat(durationOutput.trim());

        // Get file size
        const stats = await fsPromises.stat(inputPath);
        const fileSizeMB = stats.size / (1024 * 1024);

        // Calculate number of parts needed
        const numParts = Math.ceil(fileSizeMB / partSizeMB);
        const segmentDuration = Math.ceil(totalDuration / numParts);

        console.log(`📊 Video: ${fileSizeMB.toFixed(2)}MB, ${totalDuration.toFixed(1)}s`);
        console.log(`✂️ Splitting into ${numParts} parts of ~${partSizeMB}MB each`);

        const parts = [];
        const baseFilename = path.basename(inputPath, path.extname(inputPath));
        const dir = path.dirname(inputPath);

        for (let i = 0; i < numParts; i++) {
            const startTime = i * segmentDuration;
            const partPath = path.join(dir, `${baseFilename}_part${i + 1}.mp4`);

            console.log(`✂️ Creating part ${i + 1}/${numParts}...`);

            // Split using ffmpeg with copy codec (fast, no re-encoding)
            await execPromise(
                `ffmpeg -i "${inputPath}" -ss ${startTime} -t ${segmentDuration} -c copy -avoid_negative_ts 1 "${partPath}"`
            );

            parts.push(partPath);
        }

        console.log(`✅ Split complete: ${parts.length} parts created`);
        return parts;

    } catch (error) {
        console.error('❌ Video splitting error:', error);
        throw new Error('Failed to split video: ' + error.message);
    }
}

/**
 * Smart video sending with STREAMING (no disk usage)
 * @param {Object} sock - WhatsApp socket
 * @param {string} chatId - Chat ID
 * @param {string} youtubeUrl - YouTube video URL
 * @param {Object} msg - Original message for quoting
 * @param {Object} metadata - Additional metadata (author, etc)
 * @returns {Promise<void>}
 */
async function sendVideoSmart(sock, chatId, youtubeUrl, msg = null, metadata = {}) {
    try {
        const meta = await ytmp4(youtubeUrl);
        const title = (metadata.title || meta.title || 'Video').trim();
        const author = metadata.author ? `\n👤 ${metadata.author}` : '';

        // Configurable thresholds
        const docThresholdMB = parseInt(process.env.VIDEO_DOC_THRESHOLD_MB || '95', 10);
        const headTimeoutMs = parseInt(process.env.VIDEO_HEAD_TIMEOUT_MS || '15000', 10);

        // Try to get size
        let size = 0;
        try {
            const head = await axios.head(meta.url, { timeout: headTimeoutMs, maxRedirects: 5, validateStatus: (s) => s < 500 });
            size = parseInt(head.headers['content-length'] || '0');
        } catch {}

        const sizeMB = size ? (size / (1024 * 1024)) : 0;

        // Video path: only when clearly ≤16MB
        if (size && size <= 16 * 1024 * 1024) {
            await sock.sendMessage(chatId, { video: { url: meta.url }, caption: `✅ *Download Complete!*\n\n🎬 ${title}${author}\n📦 Size: ${sizeMB.toFixed(2)}MB`, mimetype: 'video/mp4' }, msg ? { quoted: msg } : {});
            return;
        }

        // Document path: only when clearly ≤ doc threshold
        if (size && size <= docThresholdMB * 1024 * 1024) {
            const safeTitle = title.replace(/[^\w\s-]/g, '').trim().substring(0, 50);
            await sock.sendMessage(chatId, { document: { url: meta.url }, mimetype: 'video/mp4', fileName: `${safeTitle}.mp4`, caption: `✅ *Download Complete!*\n\n🎬 ${title}${author}\n📦 Size: ${sizeMB.toFixed(2)}MB\n📄 Sent as document due to size` }, msg ? { quoted: msg } : {});
            return;
        }

        // Link-only path: unknown size or above threshold
        const humanSize = sizeMB ? `${sizeMB.toFixed(2)}MB` : 'unknown';
        await sock.sendMessage(chatId, {
            text: `📎 *Large Video Link*\n\n🎬 ${title}${author}\n📦 Size: ${humanSize}\n\n🔗 ${meta.url}\n\n⚠️ This video is larger than the WhatsApp upload limit for this bot. Use the link to download.`
        }, msg ? { quoted: msg } : {});
        return;
    } catch (error) {
        console.error('❌ Error in sendVideoSmart:', error);
        throw error;
    }
}

/**
 * OLD: Smart video sending based on file size (DISK-BASED - causes ENOSPC)
 * @param {Object} sock - WhatsApp socket
 * @param {string} chatId - Chat ID
 * @param {Object} videoData - Video data from downloadVideo
 * @param {Object} msg - Original message for quoting
 * @param {Object} metadata - Additional metadata (title, author, etc)
 * @returns {Promise<void>}
 */
async function sendVideoSmartOld(sock, chatId, videoData, msg = null, metadata = {}) {
    try {
        const stats = fs.statSync(videoData.filePath);
        const fileSizeMB = stats.size / (1024 * 1024);

        console.log(`📊 Video size: ${fileSizeMB.toFixed(2)}MB`);

        const title = metadata.title || videoData.title || 'Video';
        const author = metadata.author ? `\n👤 ${metadata.author}` : '';

        // Case 1: < 16MB - Send as normal video with preview
        if (fileSizeMB < 16) {
            console.log('📹 Sending as video (< 16MB)');
            await sock.sendMessage(chatId, {
                video: { url: videoData.filePath },
                caption: `✅ *Download Complete!*\n\n🎬 ${title}${author}\n📦 Size: ${fileSizeMB.toFixed(2)}MB`,
                mimetype: 'video/mp4'
            }, msg ? { quoted: msg } : {});

            return;
        }

        // Case 2: 16MB - 115MB - Send as document (no preview)
        if (fileSizeMB >= 16 && fileSizeMB <= 115) {
            console.log('📄 Sending as document (16-115MB)');

            // Use { url: filePath } format - Baileys will stream it internally
            await sock.sendMessage(chatId, {
                document: { url: videoData.filePath },
                mimetype: 'video/mp4',
                fileName: `${title.substring(0, 50)}.mp4`,
                caption: `✅ *Download Complete!*\n\n🎬 ${title}${author}\n📦 Size: ${fileSizeMB.toFixed(2)}MB\n\n⚠️ Sent as document (video too large for preview)`
            }, msg ? { quoted: msg } : {});

            return;
        }

        // Case 3: > 115MB - Split into parts and send as documents
        console.log('✂️ Video > 115MB - Splitting into parts...');

        await sock.sendMessage(chatId, {
            text: `📊 Video size: ${fileSizeMB.toFixed(2)}MB\n✂️ Splitting video into parts...\n⏳ Please wait...`
        });

        let parts = [];
        try {
            // Try to split with ffmpeg
            parts = await splitVideo(videoData.filePath, 100);
        } catch (splitError) {
            // If ffmpeg not available or fails, do manual binary split
            console.log('⚠️ FFmpeg split failed, using binary split...');
            parts = await splitVideoBinary(videoData.filePath, 100);
        }

        // Send each part
        for (let i = 0; i < parts.length; i++) {
            const partStats = fs.statSync(parts[i]);
            const partSizeMB = (partStats.size / (1024 * 1024)).toFixed(2);

            console.log(`📤 Sending part ${i + 1}/${parts.length}...`);

            // Use { url: filePath } format - Baileys will stream it internally
            await sock.sendMessage(chatId, {
                document: { url: parts[i] },
                mimetype: 'video/mp4',
                fileName: `${title.substring(0, 40)}_part${i + 1}_of_${parts.length}.mp4`,
                caption: i === 0
                    ? `✅ *Download Complete!*\n\n🎬 ${title}${author}\n📦 Total: ${fileSizeMB.toFixed(2)}MB\n📁 Part ${i + 1}/${parts.length} (${partSizeMB}MB)`
                    : `📁 Part ${i + 1}/${parts.length} (${partSizeMB}MB)`
            }, msg && i === 0 ? { quoted: msg } : {});

            // Small delay between parts
            if (i < parts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Clean up part files
        for (const partPath of parts) {
            try {
                await fsPromises.unlink(partPath);
                console.log('🗑️ Deleted part:', partPath);
            } catch (err) {
                console.error('Failed to delete part:', err);
            }
        }

        console.log('✅ All parts sent successfully');

    } catch (error) {
        console.error('❌ Error in sendVideoSmart:', error);
        throw error;
    }
}

/**
 * Binary split video (fallback when ffmpeg not available)
 * @param {string} inputPath - Path to input video
 * @param {number} partSizeMB - Size of each part in MB
 * @returns {Promise<Array<string>>} Array of part file paths
 */
async function splitVideoBinary(inputPath, partSizeMB = 100) {
    const stats = await fsPromises.stat(inputPath);
    const fileSize = stats.size;
    const partSizeBytes = partSizeMB * 1024 * 1024;
    const numParts = Math.ceil(fileSize / partSizeBytes);

    console.log(`✂️ Binary splitting into ${numParts} parts...`);

    const parts = [];
    const baseFilename = path.basename(inputPath, path.extname(inputPath));
    const dir = path.dirname(inputPath);

    const fileHandle = await fsPromises.open(inputPath, 'r');

    try {
        for (let i = 0; i < numParts; i++) {
            const partPath = path.join(dir, `${baseFilename}_part${i + 1}.mp4`);
            const start = i * partSizeBytes;
            const end = Math.min(start + partSizeBytes, fileSize);
            const length = end - start;

            const buffer = Buffer.allocUnsafe(length);
            await fileHandle.read(buffer, 0, length, start);
            await fsPromises.writeFile(partPath, buffer);

            parts.push(partPath);
            console.log(`✂️ Created part ${i + 1}/${numParts}: ${(length / (1024 * 1024)).toFixed(2)}MB`);
        }
    } finally {
        await fileHandle.close();
    }

    return parts;
}

module.exports = {
    searchYouTube,
    formatSearchResults,
    getVideoInfo,
    streamVideo,
    downloadVideo,
    getDownloadStatus,
    cancelDownload,
    storeSearchSession,
    getSearchSession,
    clearSearchSession,
    formatDownloadMessage,
    sendVideoSmart,
    sendVideoSmartOld,
    splitVideo,
    splitVideoBinary
};
