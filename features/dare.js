const axios = require('axios');

async function dareCommand(sock, chatId, message) {
    try {
        const shizokeys = 'shizo';
        const res = await axios.get(`https://shizoapi.onrender.com/api/texts/dare?apikey=${shizokeys}`, { timeout: 15000 });
        const json = res.data || {};
        const dareMessage = json.result || '🎯 I dare you to compliment someone sincerely!';

        // Send the dare message
        await sock.sendMessage(chatId, { text: dareMessage }, { quoted: message });
    } catch (error) {
        console.error('Error in dare command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to get dare. Please try again later!' }, { quoted: message });
    }
}

module.exports = { dareCommand };
