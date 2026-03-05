const { ttdl } = require("ruhend-scraper");
const axios = require('axios');

/**
 * Download TikTok video using Siputzx API with ruhend-scraper fallback
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} url - TikTok URL
 */
async function tiktokDownloader(sock, msg, url) {
    try {
        const chatId = msg.key.remoteJid;

        if (!url) {
            return await sock.sendMessage(chatId, {
                text: "📱 *TIKTOK DOWNLOADER*\n\n" +
                      "Please provide a TikTok link.\n\n" +
                      "*Example:* .tiktok https://www.tiktok.com/@user/video/123"
            });
        }

        // Check for various TikTok URL formats
        const tiktokPatterns = [
            /https?:\/\/(?:www\.)?tiktok\.com\//,
            /https?:\/\/(?:vm\.)?tiktok\.com\//,
            /https?:\/\/(?:vt\.)?tiktok\.com\//,
            /https?:\/\/(?:www\.)?tiktok\.com\/@/,
            /https?:\/\/(?:www\.)?tiktok\.com\/t\//
        ];

        const isValidUrl = tiktokPatterns.some(pattern => pattern.test(url));

        if (!isValidUrl) {
            return await sock.sendMessage(chatId, {
                text: "❌ That is not a valid TikTok link. Please provide a valid TikTok video link."
            });
        }

        // Show downloading message
        await sock.sendMessage(chatId, {
            text: "⏳ Downloading TikTok video..."
        });

        let videoUrl = null;
        let title = null;

        // Try David Cyril TikTok V3 API first (Fallback)
        try {
            const davidCyrilUrl = `https://apis.davidcyril.name.ng/download/tiktokv3?url=${encodeURIComponent(url)}&apikey=`;
            const davidResponse = await axios.get(davidCyrilUrl, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Encoding': 'identity',
                    'Referer': 'https://apis.davidcyril.name.ng/endpoints/download.html'
                }
            });

            if (davidResponse.data && davidResponse.data.success && davidResponse.data.video) {
                videoUrl = davidResponse.data.video;
                title = davidResponse.data.description || "TikTok Video";
                console.log('✅ David Cyril TikTok V3 API success');
            }
        } catch (davidError) {
            console.error(`David Cyril TikTok V3 API failed: ${davidError.message}`);
        }

        // Try Siputzx API if David Cyril failed
        if (!videoUrl) {
            try {
                const apiUrl = `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`;
                const response = await axios.get(apiUrl, {
                    timeout: 15000,
                    headers: {
                        'accept': '*/*',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (response.data && response.data.status && response.data.data) {
                    // Check for urls array first (this is the main response format)
                    if (response.data.data.urls && Array.isArray(response.data.data.urls) && response.data.data.urls.length > 0) {
                        videoUrl = response.data.data.urls[0];
                        title = response.data.data.metadata?.title || "TikTok Video";
                    } else if (response.data.data.video_url) {
                        videoUrl = response.data.data.video_url;
                        title = response.data.data.metadata?.title || "TikTok Video";
                    } else if (response.data.data.url) {
                        videoUrl = response.data.data.url;
                        title = response.data.data.metadata?.title || "TikTok Video";
                    } else if (response.data.data.download_url) {
                        videoUrl = response.data.data.download_url;
                        title = response.data.data.metadata?.title || "TikTok Video";
                    }
                }
            } catch (apiError) {
                console.error(`Siputzx API failed: ${apiError.message}`);
            }
        }

        // If Siputzx API didn't work, try ruhend-scraper (ttdl)
        if (!videoUrl) {
            try {
                console.log('Trying ruhend-scraper fallback...');
                let downloadData = await ttdl(url);
                if (downloadData && downloadData.data && downloadData.data.length > 0) {
                    const mediaData = downloadData.data;

                    // Send all media items (videos and images)
                    for (let i = 0; i < Math.min(20, mediaData.length); i++) {
                        const media = mediaData[i];
                        const mediaUrl = media.url;

                        // Check if it's a video
                        const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || media.type === 'video';

                        if (isVideo) {
                            await sock.sendMessage(chatId, {
                                video: { url: mediaUrl },
                                mimetype: "video/mp4",
                                caption: "🎥 *TikTok Video Downloaded*\n\n💡 Powered by FiazzyMD"
                            }, { quoted: msg });
                        } else {
                            await sock.sendMessage(chatId, {
                                image: { url: mediaUrl },
                                caption: "🖼️ *TikTok Image Downloaded*\n\n💡 Powered by FiazzyMD"
                            }, { quoted: msg });
                        }
                    }
                    return;
                }
            } catch (ttdlError) {
                console.error("ruhend-scraper fallback also failed:", ttdlError.message);
            }
        }

        // If we got a video URL from Siputzx API, download and send it
        if (videoUrl) {
            try {
                // Download video as buffer
                const videoResponse = await axios.get(videoUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    maxContentLength: 100 * 1024 * 1024, // 100MB limit
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'video/mp4,video/*,*/*;q=0.9',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Referer': 'https://www.tiktok.com/'
                    }
                });

                const videoBuffer = Buffer.from(videoResponse.data);

                // Validate video buffer
                if (videoBuffer.length === 0) {
                    throw new Error("Video buffer is empty");
                }

                const caption = title ? `🎥 *TikTok Video Downloaded*\n\n📝 Title: ${title}\n\n💡 Powered by FiazzyMD` : "🎥 *TikTok Video Downloaded*\n\n💡 Powered by FiazzyMD";

                await sock.sendMessage(chatId, {
                    video: videoBuffer,
                    mimetype: "video/mp4",
                    caption: caption
                }, { quoted: msg });

                return;
            } catch (downloadError) {
                console.error(`Failed to download video: ${downloadError.message}`);

                // Fallback to URL method
                try {
                    const caption = title ? `🎥 *TikTok Video Downloaded*\n\n📝 Title: ${title}\n\n💡 Powered by FiazzyMD` : "🎥 *TikTok Video Downloaded*\n\n💡 Powered by FiazzyMD";

                    await sock.sendMessage(chatId, {
                        video: { url: videoUrl },
                        mimetype: "video/mp4",
                        caption: caption
                    }, { quoted: msg });
                    return;
                } catch (urlError) {
                    console.error(`URL method also failed: ${urlError.message}`);
                }
            }
        }

        // If we reach here, no method worked
        return await sock.sendMessage(chatId, {
            text: "❌ Failed to download TikTok video. All download methods failed.\n\n💡 Please try again with a different link or check if the video is available."
        }, { quoted: msg });

    } catch (error) {
        console.error('Error in TikTok downloader:', error);
        await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ An error occurred while processing the request. Please try again later."
        }, { quoted: msg });
    }
}

module.exports = tiktokDownloader;
