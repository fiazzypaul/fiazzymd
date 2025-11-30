const axios = require('axios');
const cheerio = require('cheerio');

// Import mediafire function from separate file
const mediafire = require('./mediafire');

// Import antiwords functions
const { getWord, setWord, addWord, removeWord, checkAntiwords } = require('./antiwords');

// Import apk functions
const { apkMirror, generateList, apkGetDownloadInfo } = require('./apk');

/**
 * Check if string is a valid URL
 * @param {string} str - String to check
 * @returns {boolean|string} URL if valid, false otherwise
 */
function isUrl(str) {
    if (!str) return false;
    
    try {
        const url = new URL(str);
        return url.href;
    } catch {
        return false;
    }
}

/**
 * Simple bot wrapper function (for compatibility)
 * @param {Object} config - Configuration object
 * @param {Function} handler - Message handler function
 */
function bot(config, handler) {
    // This is a compatibility wrapper for the old bot pattern
    // We'll integrate this into our registerCommand system
    return { config, handler };
}

// Language strings for antiwords
const lang = {
    plugins: {
        antiword: {
            desc: 'Manage antiword filter in groups',
            example: (status) => `Antiword Status: *${status}*\n\n*Usage:* .antiword <on/off|add/remove|kick/warn/null|list/clear> [word]\n\n*Examples:*\n• .antiword on\n• .antiword add badword\n• .antiword remove badword\n• .antiword kick\n• .antiword list`,
            status: (action) => `✅ Antiword filter ${action}`,
            action_update: (action) => `✅ Antiword action set to *${action}*`,
            add_prompt: '❌ Please provide a word to add. Example: .antiword add badword',
            added: (word) => `✅ Added *${word}* to antiword list`,
            remove_prompt: '❌ Please provide a word to remove. Example: .antiword remove badword',
            removed: (word) => `✅ Removed *${word}* from antiword list`,
            no_words: '❌ No antiwords configured for this group',
            info: (status, action, words) => `🛡️ *Antiword Settings*\n\nStatus: *${status}*\nAction: *${action}*\nWords: *${words}*`,
            cleared: '✅ Antiword list cleared'
        },
        apk: {
            desc: 'Search and download Android APK files',
            example: '📱 *APK DOWNLOADER*\n\n*Usage:* .apk <app name>\n*Example:* .apk whatsapp\n\n💡 You can also specify architecture:\n.apk telegram,arm64-v8a',
            no_result: '❌ No APK found for your search',
            apps_list: (count) => `📱 Found ${count} apps. Select one:`
        }
    }
};

module.exports = {
    mediafire,
    isUrl,
    bot,
    getWord,
    setWord,
    addWord,
    removeWord,
    checkAntiwords,
    apkMirror,
    generateList,
    apkGetDownloadInfo,
    lang
};