const mumaker = require('mumaker');

/**
 * Generate stylized text images using various effects
 * @param {Object} sock - WhatsApp socket
 * @param {Object} msg - Message object
 * @param {string} text - Text to generate
 * @param {string} type - Effect type
 */
async function textmakerCommand(sock, msg, text, type) {
    try {
        const chatId = msg.key.remoteJid;

        if (!text) {
            return await sock.sendMessage(chatId, {
                text: `❌ Please provide text to generate\n\n*Example:* .${type} Your Text Here`
            });
        }

        // Show generating message
        await sock.sendMessage(chatId, {
            text: `🎨 Generating ${type} text effect...\n⏳ Please wait...`
        });

        let result;
        try {
            switch (type) {
                case 'metallic':
                    result = await mumaker.ephoto("https://en.ephoto360.com/impressive-decorative-3d-metal-text-effect-798.html", text);
                    break;
                case 'ice':
                    result = await mumaker.ephoto("https://en.ephoto360.com/ice-text-effect-online-101.html", text);
                    break;
                case 'snow':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-snow-3d-text-effect-free-online-621.html", text);
                    break;
                case 'impressive':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-3d-colorful-paint-text-effect-online-801.html", text);
                    break;
                case 'matrix':
                    result = await mumaker.ephoto("https://en.ephoto360.com/matrix-text-effect-154.html", text);
                    break;
                case 'luxurygold':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-luxury-gold-text-effect-online-594.html", text);
                    break;
                case 'chrome':
                    result = await mumaker.ephoto("https://en.ephoto360.com/glossy-chrome-text-effect-online-424.html", text);
                    break;
                case 'light':
                    result = await mumaker.ephoto("https://en.ephoto360.com/light-text-effect-futuristic-technology-style-648.html", text);
                    break;
                case 'neon':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-colorful-neon-light-text-effects-online-797.html", text);
                    break;
                case 'devil':
                    result = await mumaker.ephoto("https://en.ephoto360.com/neon-devil-wings-text-effect-online-683.html", text);
                    break;
                case 'purple':
                    result = await mumaker.ephoto("https://en.ephoto360.com/purple-text-effect-online-100.html", text);
                    break;
                case 'thunder':
                    result = await mumaker.ephoto("https://en.ephoto360.com/thunder-text-effect-online-97.html", text);
                    break;
                case 'leaves':
                    result = await mumaker.ephoto("https://en.ephoto360.com/green-brush-text-effect-typography-maker-online-153.html", text);
                    break;
                case '1917':
                    result = await mumaker.ephoto("https://en.ephoto360.com/1917-style-text-effect-523.html", text);
                    break;
                case 'arena':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-cover-arena-of-valor-by-mastering-360.html", text);
                    break;
                case 'hacker':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-anonymous-hacker-avatars-cyan-neon-677.html", text);
                    break;
                case 'sand':
                    result = await mumaker.ephoto("https://en.ephoto360.com/write-names-and-messages-on-the-sand-online-582.html", text);
                    break;
                case 'blackpink':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-blackpink-style-logo-with-members-signatures-810.html", text);
                    break;
                case 'glitch':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html", text);
                    break;
                case 'fire':
                    result = await mumaker.ephoto("https://en.ephoto360.com/flame-lettering-effect-372.html", text);
                    break;
                case 'wings':
                    result = await mumaker.ephoto("https://en.ephoto360.com/wings-text-effect-176.html", text);
                    break;
                case 'christmas1':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-sparkles-3d-christmas-text-effect-online-727.html", text);
                    break;
                case 'christmas2':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-beautiful-and-impressive-christmas-video-cards-for-friends-and-family-726.html", text);
                    break;
                case 'frost':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-a-frozen-christmas-text-effect-online-792.html", text);
                    break;
                case 'deadpool':
                    const deadpoolTexts = text.split(',').map(t => t.trim()).filter(Boolean);
                    if (deadpoolTexts.length !== 2) {
                        return await sock.sendMessage(chatId, { text: `❌ Deadpool requires 2 texts separated by comma\n\n*Example:* .deadpool Fiazzy, Paul` });
                    }
                    try {
                        result = await mumaker.ephoto("https://en.ephoto360.com/create-text-effects-in-the-style-of-the-deadpool-logo-818.html", [deadpoolTexts[0], deadpoolTexts[1]]);
                    } catch (err) {
                        throw new Error(`Deadpool generator failed: ${err.message}`);
                    }
                    break;
                case 'dbz':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-dragon-ball-style-text-effects-online-809.html", text);
                    break;
                case 'naruto':
                    result = await mumaker.ephoto("https://en.ephoto360.com/naruto-shippuden-logo-style-text-effect-online-808.html", text);
                    break;
                case 'pixelglitch':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-pixel-glitch-text-effect-online-769.html", text);
                    break;
                case 'arrow':
                    result = await mumaker.ephoto("https://en.ephoto360.com/create-multicolored-signature-attachment-arrow-effect-714.html", text);
                    break;
                default:
                    return await sock.sendMessage(chatId, {
                        text: `❌ Invalid text effect type: ${type}`
                    });
            }

            if (!result || !result.image) {
                throw new Error('No image URL received from the API');
            }

            // Send the generated image
            await sock.sendMessage(chatId, {
                image: { url: result.image },
                caption: `✅ *${type.toUpperCase()} TEXT EFFECT*\n\n📝 Text: ${text}\n\n💡 Powered by FiazzyMD`
            }, { quoted: msg });

        } catch (error) {
            console.error(`Error generating ${type} text:`, error);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to generate ${type} text effect.\n\n💡 Error: ${error.message}`
            });
        }

    } catch (error) {
        console.error('Error in textmaker command:', error);
        await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ An error occurred while processing your request. Please try again later."
        });
    }
}

module.exports = textmakerCommand;
