const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

/**
 * AnimeHeaven Scraper Test Script
 *
 * Flow:
 * 1. Establish session with animeheaven.me
 * 2. Search for anime
 * 3. Get anime details page
 * 4. Extract episode gate ID
 * 5. Get video source URL
 * 6. Download video with range requests
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
     * Step 1: Establish session by visiting homepage
     */
    async establishSession() {
        try {
            console.log('📡 Establishing session with animeheaven.me...');

            const response = await axios.get(this.baseUrl, {
                headers: this.headers,
                maxRedirects: 5
            });

            // Extract cookies from response
            if (response.headers['set-cookie']) {
                response.headers['set-cookie'].forEach(cookie => {
                    const [cookiePair] = cookie.split(';');
                    const [name, value] = cookiePair.split('=');
                    this.cookies[name.trim()] = value.trim();
                });
            }

            console.log('✅ Session established');
            console.log('🍪 Cookies:', Object.keys(this.cookies).join(', '));

            return true;
        } catch (error) {
            console.error('❌ Failed to establish session:', error.message);
            throw error;
        }
    }

    /**
     * Step 2: Search for anime
     */
    async searchAnime(query) {
        try {
            console.log(`\n🔍 Searching for: "${query}"`);

            const searchUrl = `${this.baseUrl}/fastsearch.php`;
            const encodedQuery = encodeURIComponent(query);

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
                }
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

            console.log(`✅ Found ${results.length} results`);
            results.forEach((r, i) => {
                console.log(`   ${i + 1}. ${r.name} (${r.code})`);
            });

            return results;
        } catch (error) {
            console.error('❌ Search failed:', error.message);
            throw error;
        }
    }

    /**
     * Step 3: Get anime details page and extract gate IDs
     */
    async getAnimeDetails(animeCode) {
        try {
            console.log(`\n📺 Getting anime details for: ${animeCode}`);

            const animeUrl = `${this.baseUrl}/anime.php?${animeCode}`;

            const response = await axios.get(animeUrl, {
                headers: {
                    ...this.headers,
                    'Referer': this.baseUrl + '/',
                    'Sec-Fetch-Site': 'same-origin',
                    'Cookie': this.formatCookies()
                }
            });

            // Save response for debugging
            fs.writeFileSync(
                path.join(__dirname, 'anime-details-response.html'),
                response.data
            );

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

            console.log(`✅ Found ${episodes.length} episodes`);
            if (episodes.length > 0) {
                console.log('First few episodes:');
                episodes.slice(0, 5).forEach(ep => {
                    console.log(`   ${ep.episodeNumber}. ${ep.text} (${ep.gateId})`);
                });
            }

            return {
                html: response.data,
                episodes
            };
        } catch (error) {
            console.error('❌ Failed to get anime details:', error.message);
            throw error;
        }
    }

    /**
     * Step 4: Get episode gate (video page)
     */
    async getEpisodeGate(gateId) {
        try {
            console.log(`\n🚪 Getting episode gate: ${gateId}`);

            const gateUrl = `${this.baseUrl}/gate.php`;

            const response = await axios.get(gateUrl, {
                headers: {
                    ...this.headers,
                    'Referer': `${this.baseUrl}/anime.php`,
                    'Cookie': `key=${gateId}`,
                    'Sec-Fetch-Site': 'same-origin'
                }
            });

            // Save response for debugging
            fs.writeFileSync(
                path.join(__dirname, 'gate-response.html'),
                response.data
            );

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

            console.log(`✅ Found ${videoSources.length} video sources`);
            videoSources.forEach((v, i) => {
                console.log(`   ${i + 1}. ${v.quality} - ${v.url.substring(0, 80)}...`);
            });

            return videoSources;
        } catch (error) {
            console.error('❌ Failed to get episode gate:', error.message);
            throw error;
        }
    }

    /**
     * Step 5: Download video with range requests (for large files)
     */
    async downloadVideo(videoUrl, outputPath, chunkSize = 10 * 1024 * 1024) {
        try {
            console.log(`\n⬇️ Downloading video...`);
            console.log(`   URL: ${videoUrl.substring(0, 80)}...`);
            console.log(`   Output: ${outputPath}`);

            // First, get the total file size
            const headResponse = await axios.head(videoUrl, {
                headers: {
                    'Referer': `${this.baseUrl}/`,
                    'Origin': this.baseUrl,
                    'Sec-Fetch-Dest': 'video',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site',
                    'User-Agent': this.headers['User-Agent']
                }
            });

            const totalSize = parseInt(headResponse.headers['content-length'] || 0);
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

            console.log(`📊 Total size: ${totalSizeMB}MB`);

            // Download in chunks using range requests with retry logic
            const writer = fs.createWriteStream(outputPath);
            let downloadedBytes = 0;
            const maxRetries = 3;

            while (downloadedBytes < totalSize) {
                const start = downloadedBytes;
                const end = Math.min(downloadedBytes + chunkSize - 1, totalSize - 1);
                let retryCount = 0;
                let chunkSuccess = false;

                while (!chunkSuccess && retryCount <= maxRetries) {
                    try {
                        console.log(`📥 Downloading chunk: bytes ${start}-${end} (${((downloadedBytes / totalSize) * 100).toFixed(1)}%)`);

                        const chunkResponse = await axios.get(videoUrl, {
                            headers: {
                                'Range': `bytes=${start}-${end}`,
                                'Referer': `${this.baseUrl}/`,
                                'Origin': this.baseUrl,
                                'Accept': '*/*',
                                'Accept-Encoding': 'identity;q=1, *;q=0',
                                'Sec-Fetch-Dest': 'video',
                                'Sec-Fetch-Mode': 'cors',
                                'Sec-Fetch-Site': 'same-site',
                                'User-Agent': this.headers['User-Agent'],
                                'Cache-Control': 'no-cache',
                                'Pragma': 'no-cache'
                            },
                            responseType: 'arraybuffer',
                            timeout: 30000 // 30 second timeout per chunk
                        });

                        // Write chunk to file
                        writer.write(Buffer.from(chunkResponse.data));
                        downloadedBytes += chunkResponse.data.byteLength;
                        chunkSuccess = true;

                    } catch (error) {
                        if ((error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('socket hang up')) && retryCount < maxRetries) {
                            retryCount++;
                            const backoffMs = 1000 * Math.pow(2, retryCount); // Exponential backoff: 2s, 4s, 8s
                            console.log(`⚠️ Network error (${error.code || error.message}). Retry ${retryCount}/${maxRetries} after ${backoffMs}ms...`);
                            await new Promise(resolve => setTimeout(resolve, backoffMs));
                        } else {
                            // Max retries exceeded or different error
                            throw error;
                        }
                    }
                }

                if (!chunkSuccess) {
                    throw new Error(`Failed to download chunk after ${maxRetries} retries`);
                }
            }

            writer.end();

            console.log(`✅ Download complete: ${outputPath}`);
            return outputPath;
        } catch (error) {
            console.error('❌ Download failed:', error.message);
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

// Test the scraper
async function test() {
    try {
        const scraper = new AnimeHeavenScraper();

        // Step 1: Establish session
        await scraper.establishSession();

        // Step 2: Search for anime
        const query = 'Infinite';
        const results = await scraper.searchAnime(query);

        if (results.length === 0) {
            console.log('❌ No results found');
            return;
        }

        // Step 3: Get details for first result
        const firstAnime = results[0];
        console.log(`\n📺 Selected: ${firstAnime.name}`);

        const details = await scraper.getAnimeDetails(firstAnime.code);

        // Step 4: Get first episode's video source
        if (details.episodes.length > 0) {
            const firstEpisode = details.episodes[0];
            console.log(`\n🎬 Getting video for: ${firstEpisode.text}`);

            const videoSources = await scraper.getEpisodeGate(firstEpisode.gateId);

            if (videoSources.length > 0) {
                const videoUrl = videoSources[0].url;
                console.log(`\n📹 Video URL: ${videoUrl.substring(0, 100)}...`);

                // Ask user if they want to download
                console.log('\n⚠️  Ready to download episode');
                console.log('   Uncomment the download line to proceed');
                console.log('   This will download the full video file');

                // Uncomment to actually download:
                 const outputPath = path.join(__dirname, 'test-episode.mp4');
                 await scraper.downloadVideo(videoUrl, outputPath);

                console.log('\n✅ Test completed successfully!');
                console.log('📝 Video sources extracted and ready for download');
            } else {
                console.log('❌ No video sources found');
            }
        } else {
            console.log('❌ No episodes found');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Stack:', error.stack);
    }
}

// Run the test
console.log('🎬 AnimeHeaven Scraper Test\n');
test();
