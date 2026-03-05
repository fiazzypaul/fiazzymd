const axios = require('axios');

// UA for API requests
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

/**
 * Fetch lyrics for a song using David Cyril API
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} query - Song name to search
 */
async function lyricsCommand(sock, msg, query) {
    try {
        const chatId = msg.key.remoteJid;

        if (!query) {
            return await sock.sendMessage(chatId, {
                text: "📜 *LYRICS SEARCH*\n\nPlease provide a song name.\n\n*Example:* .lyrics Faded"
            });
        }

        // Show searching message
        await sock.sendMessage(chatId, {
            text: `🔍 Searching lyrics for: *${query}*...\n⏳ Please wait...`
        });

        const url = `https://apis.davidcyril.name.ng/lyrics3?song=${encodeURIComponent(query)}`;
        
        try {
            const response = await axios.get(url, {
                timeout: 180000, // Increased to 180s
                validateStatus: (status) => status < 500, // Handle 500+ as errors in catch
                headers: {
                    'User-Agent': UA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Encoding': 'identity',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Referer': 'https://apis.davidcyril.name.ng/endpoints/search.html'
                }
            });

            if (response.data && response.data.success && response.data.result) {
                const { song, artist, lyrics } = response.data.result;
                
                let message = `🎵 *SONG LYRICS*\n\n`;
                message += `📝 *Title:* ${song}\n`;
                message += `👤 *Artist:* ${artist}\n\n`;
                message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                message += lyrics;
                message += `\n\n━━━━━━━━━━━━━━━━━━━━\n`;
                message += `💡 *Powered by FiazzyMD*`;

                await sock.sendMessage(chatId, { text: message }, { quoted: msg });
            } else {
                throw new Error('Lyrics not found or API error');
            }
        } catch (apiError) {
            console.error('David Cyril Lyrics API error:', apiError.message);
            
            // Handle 500 error specifically
            if (apiError.response && apiError.response.status === 500) {
                return await sock.sendMessage(chatId, {
                    text: `❌ Lyrics not currently available for "*${query}*". Please try again later.`
                });
            }

            await sock.sendMessage(chatId, {
                text: `❌ Could not find lyrics for "*${query}*".\n\n💡 Please try a different song name.`
            });
        }

    } catch (error) {
        console.error('Error in lyrics command:', error);
        await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ An error occurred while fetching lyrics. Please try again later."
        });
    }
}

module.exports = {
    lyricsCommand
};
