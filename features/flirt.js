const axios = require('axios');

async function flirtCommand(sock, chatId, message) {
    try {
        const shizokeys = 'shizo';
        const res = await axios.get(`https://shizoapi.onrender.com/api/texts/flirt?apikey=${shizokeys}`, { timeout: 15000 });
        const json = res.data || {};
        const flirtMessage = json.result || '❤️ You light up my world!';

        // Send the flirt message
        await sock.sendMessage(chatId, { text: flirtMessage }, { quoted: message });
    } catch (error) {
        console.error('Error in flirt command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to get flirt message. Please try again later!' }, { quoted: message });
    }
}

module.exports = { flirtCommand };