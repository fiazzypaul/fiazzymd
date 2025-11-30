/**
 * APK Download Command - Search and download Android APK files
 * Searches for Android apps and provides download links
 */

module.exports = function registerApkCommand({ registerCommand }) {
    const { apkMirror, apkGetDownloadInfo, lang } = require('../lib');
    const config = {
        prefix: process.env.PREFIX || '.'
    };
    const lastApkResultsByChat = new Map();

    registerCommand('apk', 'Search and download Android APK files', async (sock, msg, args) => {
        const match = args.join(' ');
        
        if (!match) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: lang.plugins.apk.example
            });
        }

        const [query] = match.split(',');
        const { result, status } = await apkMirror(query.trim(), false);
        if (!result || result.length === 0 || status !== 200) {
            return await sock.sendMessage(msg.key.remoteJid, { text: lang.plugins.apk.no_result });
        }
        if (result.length === 1) {
            const info = await apkGetDownloadInfo(result[0].url);
            if (info.downloadUrl) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    document: { url: info.downloadUrl },
                    fileName: (info.title || 'app') + '.apk',
                    mimetype: 'application/vnd.android.package-archive',
                    caption: `📱 ${info.title || 'APK'}`
                });
            }
            return await sock.sendMessage(msg.key.remoteJid, { text: `📱 ${info.title || 'APK'}\n🔗 ${info.pageUrl}` });
        }
        lastApkResultsByChat.set(msg.key.remoteJid, result);
        const listText = result.map((r, i) => `${i + 1}. ${r.title}`).join('\n');
        await sock.sendMessage(msg.key.remoteJid, {
            text: `📱 ${lang.plugins.apk.apps_list(result.length)}\n\n${listText}\n\nReply with: ${config.prefix}apkselect <number>`
        });
    });

    // Handle APK selection from list
    registerCommand('apkselect', 'Handle APK selection from list', async (sock, msg, args) => {
        const idxStr = (args[0] || '').trim();
        const idx = parseInt(idxStr, 10);
        const list = lastApkResultsByChat.get(msg.key.remoteJid) || [];
        if (!idx || isNaN(idx) || idx < 1 || idx > list.length) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Invalid selection number' });
        }
        const item = list[idx - 1];
        try {
            const info = await apkGetDownloadInfo(item.url);
            if (info.downloadUrl) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    document: { url: info.downloadUrl },
                    fileName: (info.title || 'app') + '.apk',
                    mimetype: 'application/vnd.android.package-archive',
                    caption: `📱 ${info.title || 'APK'}`
                });
            }
            return await sock.sendMessage(msg.key.remoteJid, { text: `📱 ${info.title || 'APK'}\n🔗 ${info.pageUrl}` });
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to fetch download: ${error.message}` });
        }
    });
};
