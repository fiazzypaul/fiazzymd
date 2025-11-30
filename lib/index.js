const axios = require('axios');
const cheerio = require('cheerio');

// Import mediafire function from separate file
const mediafire = require('./mediafire');

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

module.exports = {
    mediafire,
    isUrl,
    bot
};