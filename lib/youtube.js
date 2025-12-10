const yts = require('yt-search');
const NodeID3 = require('node-id3');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { randomBytes } = require('crypto');

const ytIdRegex = /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/;

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

class YTDownloader {
    constructor() {
        this.tmpDir = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(this.tmpDir)) {
            fs.mkdirSync(this.tmpDir, { recursive: true });
        }
    }

    /**
     * Checks if it is yt link
     * @param {string|URL} url youtube url
     * @returns Returns true if the given YouTube URL.
     */
    static isYTUrl(url) {
        return ytIdRegex.test(url);
    }

    /**
     * VideoID from url
     * @param {string|URL} url to get videoID
     * @returns
     */
    static getVideoID(url) {
        if (!this.isYTUrl(url)) throw new Error('is not YouTube URL');
        return ytIdRegex.exec(url)[1];
    }

    /**
     * Try request with retries
     * @param {Function} getter
     * @param {number} attempts
     * @returns
     */
    static async tryRequest(getter, attempts = 3) {
        let lastError;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return await getter();
            } catch (err) {
                lastError = err;
                if (attempt < attempts) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
        }
        throw lastError;
    }

    /**
     * Get download from Izumi API by URL
     * @param {string} youtubeUrl
     * @returns
     */
    static async getIzumiDownloadByUrl(youtubeUrl) {
        const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
        const res = await this.tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
        if (res?.data?.result?.download) return res.data.result;
        throw new Error('Izumi youtube?url returned no download');
    }

    /**
     * Get download from Izumi API by query
     * @param {string} query
     * @returns
     */
    static async getIzumiDownloadByQuery(query) {
        const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`;
        const res = await this.tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
        if (res?.data?.result?.download) return res.data.result;
        throw new Error('Izumi youtube-play returned no download');
    }

    /**
     * Get download from Okatsu API by URL
     * @param {string} youtubeUrl
     * @returns
     */
    static async getOkatsuDownloadByUrl(youtubeUrl) {
        const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await this.tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
        if (res?.data?.dl) {
            return {
                download: res.data.dl,
                title: res.data.title,
                thumbnail: res.data.thumb
            };
        }
        throw new Error('Okatsu ytmp3 returned no download');
    }

    /**
     * Get video download from Okatsu API by URL
     * @param {string} youtubeUrl
     * @returns
     */
    static async getOkatsuVideoByUrl(youtubeUrl) {
        const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
        const res = await this.tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
        if (res?.data?.dl) {
            return {
                download: res.data.dl,
                title: res.data.title,
                thumbnail: res.data.thumb
            };
        }
        throw new Error('Okatsu ytmp4 returned no download');
    }

    /**
     * Fetch buffer from URL
     * @param {string} url
     * @returns
     */
    static async fetchBuffer(url) {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return { buffer: Buffer.from(response.data) };
    }

    /**
     * Write Track Tag Metadata
     * @param {string} filePath
     * @param {Object} Metadata
     */
    static async WriteTags(filePath, Metadata) {
        try {
            const imageBuffer = Metadata.Image ? (await this.fetchBuffer(Metadata.Image)).buffer : null;

            const tags = {
                title: Metadata.Title,
                artist: Metadata.Artist,
                originalArtist: Metadata.Artist,
                album: Metadata.Album,
                year: Metadata.Year || ''
            };

            if (imageBuffer) {
                tags.image = {
                    mime: 'jpeg',
                    type: {
                        id: 3,
                        name: 'front cover',
                    },
                    imageBuffer: imageBuffer,
                    description: `Cover of ${Metadata.Title}`,
                };
            }

            NodeID3.write(tags, filePath);
        } catch (error) {
            console.error('Error writing tags:', error.message);
        }
    }

    /**
     * Search YouTube videos
     * @param {string} query
     * @param {Object} options
     * @returns
     */
    static async search(query, options = {}) {
        const search = await yts(query);
        return search.videos;
    }

    /**
     * Get YouTube audio download URL using Izumi/Okatsu APIs
     * @param {string|URL} url YouTube link or search query
     * @returns {Object} { url, title, thumbnail, channel }
     */
    static async mp3(url) {
        try {
            if (!url) throw new Error('Video ID or YouTube Url is required');

            console.log('🎵 Getting audio download link via API...');

            let audioData;

            // If it's a YouTube URL, try Izumi by URL first
            if (this.isYTUrl(url)) {
                try {
                    // 1) Primary: Izumi by YouTube URL
                    audioData = await this.getIzumiDownloadByUrl(url);
                } catch (e1) {
                    try {
                        // 2) Fallback: Okatsu by YouTube URL
                        audioData = await this.getOkatsuDownloadByUrl(url);
                    } catch (e2) {
                        throw new Error('All download APIs failed');
                    }
                }
            } else {
                // Search query - try Izumi search
                try {
                    audioData = await this.getIzumiDownloadByQuery(url);
                } catch (e) {
                    throw new Error('Failed to download by query');
                }
            }

            const downloadUrl = audioData.download || audioData.dl || audioData.url;
            if (!downloadUrl) {
                throw new Error('No download URL in API response');
            }

            console.log('✅ Got audio download URL');

            return {
                url: downloadUrl,
                title: audioData.title || 'Unknown',
                channel: audioData.channel || audioData.author || 'YouTube',
                thumbnail: audioData.thumbnail || audioData.thumb || null,
                duration: audioData.duration || 0
            };
        } catch (error) {
            console.error('YouTube MP3 download error:', error.message);
            throw error;
        }
    }

    /**
     * Get YouTube video download URL using Okatsu API
     * @param {string} url YouTube URL
     * @returns {Object} { url, title, thumbnail }
     */
    static async downloadMP4(url) {
        try {
            if (!url) throw new Error('YouTube URL is required');

            console.log('🎬 Getting video download link via API...');

            // Use Okatsu API for video download
            const videoData = await this.getOkatsuVideoByUrl(url);

            const downloadUrl = videoData.download || videoData.dl;
            if (!downloadUrl) {
                throw new Error('No download URL in API response');
            }

            console.log('✅ Got video download URL');

            return {
                url: downloadUrl,
                title: videoData.title || 'Unknown',
                thumbnail: videoData.thumbnail || videoData.thumb || null
            };
        } catch (error) {
            console.error('YouTube video download error:', error.message);
            throw error;
        }
    }
}

module.exports = new YTDownloader();
