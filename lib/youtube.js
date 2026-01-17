const axios = require('axios');
const yts = require('yt-search');

const ytIdRegex = /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/;

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'identity'
    }
};

async function tryRequest(getter, attempts = 3) {
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

// ===== AUDIO DOWNLOAD APIs =====

async function getYupraAudioByUrl(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
        return {
            download: res.data.data.download_url,
            title: res.data.data.title,
            thumbnail: res.data.data.thumbnail
        };
    }
    throw new Error('Yupra ytmp3 returned no download');
}

async function getIzumiAudioByUrl(youtubeUrl) {
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(youtubeUrl)}&format=mp3`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi audio api returned no download');
}

async function getIzumiAudioByQuery(query) {
    const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube-play?query=${encodeURIComponent(query)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.download) return res.data.result;
    throw new Error('Izumi youtube-play returned no download');
}

async function getOkatsuAudioByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.dl) {
        return {
            download: res.data.dl,
            title: res.data.title,
            thumbnail: res.data.thumb
        };
    }
    throw new Error('Okatsu ytmp3 returned no download');
}

// ===== VIDEO DOWNLOAD APIs =====

async function getYupraVideoByUrl(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
        return {
            download: res.data.data.download_url,
            title: res.data.data.title,
            thumbnail: res.data.data.thumbnail
        };
    }
    throw new Error('Yupra ytmp4 returned no download');
}

async function getIzumiVideoByUrl(youtubeUrl) {
    // Try highest quality first (1080p), fallback to 720p if not available
    const formats = ['1080', '720'];

    for (const format of formats) {
        try {
            const apiUrl = `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${encodeURIComponent(youtubeUrl)}&format=${format}`;
            const res = await axios.get(apiUrl, AXIOS_DEFAULTS);
            if (res?.data?.result?.download) {
                console.log(`✅ Got video in ${format}p quality`);
                return res.data.result;
            }
        } catch (err) {
            console.log(`⚠️ ${format}p not available, trying next quality...`);
            continue;
        }
    }

    throw new Error('Izumi video api returned no download');
}

async function getOkatsuVideoByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.result?.mp4) {
        return { download: res.data.result.mp4, title: res.data.result.title };
    }
    throw new Error('Okatsu ytmp4 returned no mp4');
}

// ===== MAIN FUNCTIONS =====

/**
 * Check if string is YouTube URL
 */
function isYTUrl(url) {
    return ytIdRegex.test(url);
}

/**
 * Search YouTube
 */
async function search(query) {
    const results = await yts(query);
    return results.videos;
}

/**
 * Get audio download link
 * @param {string} input - YouTube URL or search query
 * @returns {Promise<Object>} { url, title, thumbnail, channel }
 */
async function getAudio(input) {
    if (!input) throw new Error('Input is required');

    console.log('🎵 Getting audio download link...');

    let audioData;

    // If it's a YouTube URL
    if (isYTUrl(input)) {
        try {
            audioData = await getYupraAudioByUrl(input);
        } catch (e1) {
            try {
                audioData = await getIzumiAudioByUrl(input);
            } catch (e2) {
                try {
                    audioData = await getOkatsuAudioByUrl(input);
                } catch (e3) {
                    throw new Error('All audio download APIs failed');
                }
            }
        }
    } else {
        // Search query
        try {
            audioData = await getIzumiAudioByQuery(input);
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
}

/**
 * Get video download link
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>} { url, title, thumbnail }
 */
async function getVideo(url) {
    if (!url) throw new Error('YouTube URL is required');

    console.log('🎬 Getting video download link...');

    let videoData;

    try {
        videoData = await getYupraVideoByUrl(url);
    } catch (e1) {
        // Try Izumi first, then Okatsu
        try {
            videoData = await getIzumiVideoByUrl(url);
        } catch (e2) {
            try {
                videoData = await getOkatsuVideoByUrl(url);
            } catch (e3) {
                throw new Error('All video download APIs failed');
            }
        }
    }

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
}

module.exports = {
    isYTUrl,
    search,
    getAudio,
    getVideo
};
