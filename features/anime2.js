const axios = require('axios');
const cheerio = require('cheerio');

// Store user anime download sessions
const anime2Sessions = new Map();

/**
 * AnimeHeaven Scraper Class
 */
class AnimeHeavenScraper {
    constructor() {
        this.baseUrl = 'https://animeheaven.me';
        this.cookies = {};
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Connection': 'keep-alive',
            'Sec-Ch-Ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        };
    }

    /**
     * Establish session by visiting homepage
     */
    async establishSession() {
        try {
            const response = await axios.get(this.baseUrl, {
                headers: this.headers,
                maxRedirects: 5,
                timeout: 30000
            });

            // Extract cookies from response
            if (response.headers['set-cookie']) {
                response.headers['set-cookie'].forEach(cookie => {
                    const [cookiePair] = cookie.split(';');
                    const [name, value] = cookiePair.split('=');
                    this.cookies[name.trim()] = value.trim();
                });
            }

            return true;
        } catch (error) {
            console.error('Failed to establish session:', error.message);
            throw error;
        }
    }

    /**
     * Search for anime
     */
    async searchAnime(query) {
        try {
            const searchUrl = `${this.baseUrl}/fastsearch.php`;

            const response = await axios.get(searchUrl, {
                params: {
                    xhr: '1',
                    s: query
                },
                headers: {
                    ...this.headers,
                    'Accept': '*/*',
                    'Referer': this.baseUrl + '/',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Cookie': this.formatCookies()
                },
                timeout: 30000
            });

            // Parse HTML response
            const $ = cheerio.load(response.data);
            const results = [];

            $('a.ac').each((i, elem) => {
                const href = $(elem).attr('href');
                const name = $(elem).find('.fastname').text().trim();
                const imgSrc = $(elem).find('img.coverimg').attr('src');

                if (href && name) {
                    // Extract code from href (e.g., /anime.php?lqode -> lqode)
                    const code = href.split('?')[1];
                    results.push({
                        name,
                        code,
                        href,
                        image: imgSrc
                    });
                }
            });

            return results;
        } catch (error) {
            console.error('Search failed:', error.message);
            throw error;
        }
    }

    /**
     * Get anime details page and extract episode gate IDs
     */
    async getAnimeDetails(animeCode) {
        try {
            const animeUrl = `${this.baseUrl}/anime.php?${animeCode}`;

            const response = await axios.get(animeUrl, {
                headers: {
                    ...this.headers,
                    'Referer': this.baseUrl + '/',
                    'Sec-Fetch-Site': 'same-origin',
                    'Cookie': this.formatCookies()
                },
                timeout: 30000
            });

            // Parse HTML to extract episode gate IDs from onclick attributes
            const $ = cheerio.load(response.data);
            const episodes = [];

            // Look for elements with onclick="gate(...)" which contains the gate ID
            $('[onclick*="gate"]').each((i, elem) => {
                const onclick = $(elem).attr('onclick');

                if (onclick) {
                    // Extract gate ID from onclick="gate('GATE_ID_HERE')"
                    const match = onclick.match(/gate\(['"]([^'"]+)['"]\)/);
                    if (match && match[1]) {
                        // Find the episode number in the <div class='watch2'> element
                        const watch2Div = $(elem).find('.watch2');
                        let episodeNumber = episodes.length + 1;

                        if (watch2Div.length > 0) {
                            const epNum = parseInt(watch2Div.text().trim());
                            if (!isNaN(epNum)) {
                                episodeNumber = epNum;
                            }
                        }

                        // Get the time added text for display
                        const timeDiv = $(elem).find('.watch1').last();
                        const timeText = timeDiv.length > 0 ? timeDiv.text().trim() : '';
                        const displayText = `Episode ${episodeNumber}${timeText ? ' (' + timeText + ')' : ''}`;

                        episodes.push({
                            text: displayText,
                            gateId: match[1],
                            episodeNumber
                        });
                    }
                }
            });

            // Sort episodes by episode number in ascending order
            episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

            return {
                episodes
            };
        } catch (error) {
            console.error('Failed to get anime details:', error.message);
            throw error;
        }
    }

    /**
     * Get episode gate (video page)
     */
    async getEpisodeGate(gateId) {
        try {
            const gateUrl = `${this.baseUrl}/gate.php`;

            const response = await axios.get(gateUrl, {
                headers: {
                    ...this.headers,
                    'Referer': `${this.baseUrl}/anime.php`,
                    'Cookie': `key=${gateId}`,
                    'Sec-Fetch-Site': 'same-origin'
                },
                timeout: 30000
            });

            // Extract video source URLs
            const $ = cheerio.load(response.data);
            const videoSources = [];

            $('source[src*="video.mp4"]').each((i, elem) => {
                const src = $(elem).attr('src');
                const type = $(elem).attr('type');

                if (src) {
                    videoSources.push({
                        url: src,
                        type,
                        quality: src.includes('1080p') ? '1080p' : src.includes('720p') ? '720p' : 'unknown'
                    });
                }
            });

            return videoSources;
        } catch (error) {
            console.error('Failed to get episode gate:', error.message);
            throw error;
        }
    }

    /**
     * Get video info for sending
     */
    async getVideoInfo(videoUrl) {
        try {
            const headResponse = await axios.head(videoUrl, {
                headers: {
                    'Referer': `${this.baseUrl}/`,
                    'Origin': this.baseUrl,
                    'User-Agent': this.headers['User-Agent']
                },
                timeout: 30000
            });

            const totalSize = parseInt(headResponse.headers['content-length'] || 0);
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

            return {
                url: videoUrl,
                size: totalSize,
                sizeMB: parseFloat(totalSizeMB)
            };
        } catch (error) {
            console.error('Failed to get video info:', error.message);
            throw error;
        }
    }

    /**
     * Helper: Format cookies for request headers
     */
    formatCookies() {
        return Object.entries(this.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }
}

/**
 * Store anime2 session
 */
function storeAnime2Session(chatId, sessionData) {
    anime2Sessions.set(chatId, {
        ...sessionData,
        timestamp: Date.now()
    });

    // Auto-cleanup after 10 minutes
    setTimeout(() => {
        if (anime2Sessions.has(chatId)) {
            const session = anime2Sessions.get(chatId);
            if (Date.now() - session.timestamp > 600000) {
                anime2Sessions.delete(chatId);
            }
        }
    }, 600000);
}

/**
 * Get anime2 session
 */
function getAnime2Session(chatId) {
    return anime2Sessions.get(chatId);
}

/**
 * Clear anime2 session
 */
function clearAnime2Session(chatId) {
    anime2Sessions.delete(chatId);
}

/**
 * Format search results for display
 */
function formatSearchResults(results, query) {
    if (results.length === 0) {
        return `No anime found for: "${query}"\n\nTry a different search term`;
    }

    const maxResults = Math.min(results.length, 10);
    let message = `*Anime Download - Search Results*\n`;
    message += `Query: "${query}"\n`;
    message += `Found: ${results.length} anime\n\n`;
    message += '\n\n';

    for (let i = 0; i < maxResults; i++) {
        const result = results[i];
        message += `*${i + 1}.* ${result.name}\n\n`;
    }

    message += '\n\n';
    message += `*Reply with a number (1-${maxResults}) to select*`;

    return message;
}

/**
 * Format episode list for display
 */
function formatEpisodeList(episodes, animeName) {
    if (episodes.length === 0) {
        return `*No episodes found for:* ${animeName}`;
    }

    const maxDisplay = Math.min(episodes.length, 20);
    let message = `*${animeName}*\n`;
    message += `Total Episodes: ${episodes.length}\n\n`;
    message += '\n\n';

    for (let i = 0; i < maxDisplay; i++) {
        const ep = episodes[i];
        message += `*${ep.episodeNumber}.* ${ep.text}\n`;
    }

    if (episodes.length > maxDisplay) {
        message += `\n... and ${episodes.length - maxDisplay} more episodes\n`;
    }

    message += '\n\n';
    message += `*Reply with episode number (1-${episodes.length})*`;

    return message;
}

/**
 * Handle .anime2 command - search for anime
 */
async function handleAnime2Command(sock, chatId, query, msg) {
    try {
        if (!query || query.trim() === '') {
            await sock.sendMessage(chatId, {
                text: '*Usage:* .anime2 <search query>\n\n*Example:* .anime2 naruto\n\nSearch and download anime episodes'
            }, { quoted: msg });
            return;
        }

        // Send searching message
        await sock.sendMessage(chatId, {
            text: `*Searching anime:* "${query}"\n\nPlease wait...`
        }, { quoted: msg });

        // Create scraper and establish session
        const scraper = new AnimeHeavenScraper();
        await scraper.establishSession();

        // Search for anime
        const results = await scraper.searchAnime(query);

        // Store session with scraper instance
        storeAnime2Session(chatId, {
            step: 'search',
            query,
            results,
            scraper
        });

        // Format and send results
        const message = formatSearchResults(results, query);
        await sock.sendMessage(chatId, { text: message }, { quoted: msg });

    } catch (error) {
        console.error('Anime2 search error:', error);
        await sock.sendMessage(chatId, {
            text: `*Search failed*\n\n${error.message}\n\nTry again later`
        }, { quoted: msg });
    }
}

/**
 * Handle anime2 selection (when user replies with a number)
 */
async function handleAnime2Selection(sock, chatId, selection, msg) {
    try {
        const session = getAnime2Session(chatId);
        if (!session) {
            return false; // No active session
        }

        const selectionNum = parseInt(selection);
        if (isNaN(selectionNum) || selectionNum < 1) {
            return false; // Not a valid selection
        }

        if (session.step === 'search') {
            // User is selecting an anime from search results
            if (selectionNum > session.results.length) {
                await sock.sendMessage(chatId, {
                    text: `*Invalid selection*\n\nChoose 1-${session.results.length}`
                }, { quoted: msg });
                return true;
            }

            const selectedAnime = session.results[selectionNum - 1];

            // Send loading message
            await sock.sendMessage(chatId, {
                text: `*${selectedAnime.name}*\n\nFetching episodes...`
            }, { quoted: msg });

            // Get anime details (episodes)
            const details = await session.scraper.getAnimeDetails(selectedAnime.code);

            // Update session
            storeAnime2Session(chatId, {
                step: 'episodes',
                query: session.query,
                selectedAnime,
                episodes: details.episodes,
                scraper: session.scraper
            });

            // Format and send episode list
            const message = formatEpisodeList(details.episodes, selectedAnime.name);
            await sock.sendMessage(chatId, { text: message }, { quoted: msg });

            return true;

        } else if (session.step === 'episodes') {
            // User is selecting an episode
            if (selectionNum > session.episodes.length || selectionNum < 1) {
                await sock.sendMessage(chatId, {
                    text: `*Invalid episode*\n\nChoose 1-${session.episodes.length}`
                }, { quoted: msg });
                return true;
            }

            const selectedEpisode = session.episodes[selectionNum - 1];

            // Send downloading message
            await sock.sendMessage(chatId, {
                text: `*Downloading*\n\n${session.selectedAnime.name}\n${selectedEpisode.text}\n\nPlease wait...`
            }, { quoted: msg });

            // Get video sources
            const videoSources = await session.scraper.getEpisodeGate(selectedEpisode.gateId);

            if (videoSources.length === 0) {
                await sock.sendMessage(chatId, {
                    text: `*No video sources found*\n\nTry another episode`
                }, { quoted: msg });
                return true;
            }

            const videoUrl = videoSources[0].url;

            // Get video info
            const videoInfo = await session.scraper.getVideoInfo(videoUrl);

            // Send video based on size (page link for large files)
            await sendAnime2Video(sock, chatId, videoInfo, session.selectedAnime.name, selectedEpisode.text, session.selectedAnime.code, msg);

            // Clear session after download
            clearAnime2Session(chatId);

            return true;
        }

        return false;

    } catch (error) {
        console.error('Anime2 selection error:', error);
        await sock.sendMessage(chatId, {
            text: `*Download failed*\n\n${error.message}\n\nTry another episode`
        }, { quoted: msg });
        return true;
    }
}

/**
 * Send anime video with smart size handling and splitting
 */
async function sendAnime2Video(sock, chatId, videoInfo, animeName, episodeText, animeCode, msg) {
    try {
        const sizeMB = videoInfo.sizeMB;
        const safeFilename = animeName.replace(/[^\w\s-]/g, '').trim().substring(0, 50);
        const epNum = episodeText.match(/\d+/)?.[0] || 'X';
        const caption = `*Download Complete!*\n\n${animeName}\n${episodeText}\nSize: ${sizeMB.toFixed(2)}MB`;

        // Path 1: Video (d16MB)
        if (sizeMB <= 16) {
            await sock.sendMessage(chatId, {
                video: { url: videoInfo.url },
                caption,
                mimetype: 'video/mp4'
            }, { quoted: msg });
            return;
        }

        // Link-only for any video > 16MB (prevent ENOSPC and restarts)
        const pageUrl = `https://animeheaven.me/anime.php?${animeCode || ''}`;
        await sock.sendMessage(chatId, {
            text: `*Episode Link*\n\n${animeName}\n${episodeText}\nSize: ${sizeMB.toFixed(2)}MB\n\nAnime Page:\n${pageUrl}\n\nOpen this page in your browser and tap the episode to play/download.`
        }, { quoted: msg });

    } catch (error) {
        console.error('Send anime2 video error:', error);

        // Final fallback: send link only
        const pageUrl = `https://animeheaven.me/anime.php?${animeCode || ''}`;
        await sock.sendMessage(chatId, {
            text: `*Failed to send video*\n\n${animeName}\n${episodeText}\n\n*Anime Page:*\n${pageUrl}\n\nOpen the page and tap the episode to play/download.`
        }, { quoted: msg });
        return;
    }
}

module.exports = {
    handleAnime2Command,
    handleAnime2Selection,
    getAnime2Session,
    clearAnime2Session
};
