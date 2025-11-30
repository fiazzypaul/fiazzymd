/**
 * MediaFire download command
 * Downloads files from MediaFire links
 */

module.exports = function registerMediafireCommand({ registerCommand }) {
    const config = {
        prefix: process.env.PREFIX || '.'
    };
    
    registerCommand('mediafire', 'Download files from MediaFire', async (sock, msg, args) => {
        const mediafire = require('../lib/mediafire');
        
        if (args.length === 0) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📁 *MEDIAFIRE DOWNLOADER*

` +
                      `*Usage:* ${config.prefix}mediafire <mediafire_url>

` +
                      `*Examples:*
` +
                      `${config.prefix}mediafire https://www.mediafire.com/file/abc123/filename.zip
` +
                      `${config.prefix}mediafire https://www.mediafire.com/file/xyz789/document.pdf

` +
                      `💡 Supports all MediaFire file types`
            });
            return;
        }

        const url = args[0];
        
        // Validate URL
        if (!url.includes('mediafire.com')) {
            await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Invalid MediaFire URL. Please provide a valid MediaFire link.'
            });
            return;
        }

        try {
            // Send initial message
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📁 *Processing MediaFire link...*

🔗 URL: ${url}
⏳ Please wait while I extract the download link...`
            });

            // Extract download information
            const result = await mediafire(url);
            
            if (!result) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ Could not extract download link from MediaFire. The file might be removed or the URL is invalid.'
                });
                return;
            }

            // Send download information
            await sock.sendMessage(msg.key.remoteJid, {
                text: `📁 *MediaFire File Found!*

` +
                      `📄 *Filename:* ${result.filename}
` +
                      `📊 *Size:* ${result.size}
` +
                      `🔗 *Download Link:* ${result.url}

` +
                      `💡 Click the link above to download the file directly.`
            });

        } catch (error) {
            console.error('MediaFire download error:', error);
            await sock.sendMessage(msg.key.remoteJid, {
                text: `❌ Error processing MediaFire link: ${error.message}`
            });
        }
    });
};
