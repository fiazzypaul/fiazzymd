/**
 * APK Mirror search and download functionality
 * Searches for Android APK files and provides download links
 */

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Search for APK files on APKMirror
 * @param {string} query - App name to search for
 * @param {boolean} detailed - Whether to get detailed results
 * @returns {Promise<{result: Array|Object, status: number}>}
 */
async function apkMirror(query, detailed = false) {
    try {
        const q = String(query || '').trim();
        if (!q) return { result: [], status: 400 };
        const url = `https://www.apkmirror.com/?s=${encodeURIComponent(q)}`;
        const res = await axios.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(res.data);
        const items = new Map();
        $('a').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = ($(el).text() || '').trim();
            if (href.startsWith('/apk/') && text.length > 0) {
                if (!items.has(href)) items.set(href, text);
            }
        });
        const results = Array.from(items.entries()).slice(0, 10).map(([href, text]) => ({
            title: text,
            url: `https://www.apkmirror.com${href}`
        }));
        if (results.length === 0) return { result: [], status: 404 };
        if (detailed) {
            const first = results[0];
            const detail = await apkGetDownloadInfo(first.url);
            return { result: detail, status: 200 };
        }
        return { result: results, status: 200 };
    } catch (error) {
        console.error('APK Mirror search error:', error.message);
        return { result: [], status: 500 };
    }
}

async function apkGetDownloadInfo(appUrl) {
    try {
        const u = appUrl.startsWith('http') ? appUrl : `https://www.apkmirror.com${appUrl}`;
        const res = await axios.get(u, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);
        let dlLink = null;
        $('a').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = ($(el).text() || '').toLowerCase();
            if (!dlLink && href.includes('/download/') && (text.includes('download') || text.includes('apk'))) {
                dlLink = href.startsWith('http') ? href : `https://www.apkmirror.com${href}`;
            }
        });
        if (!dlLink) return { title: $('h1').first().text().trim(), pageUrl: u };
        const res2 = await axios.get(dlLink, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $$ = cheerio.load(res2.data);
        let finalLink = null;
        $$('a').each((_, el) => {
            const href = $$(el).attr('href') || '';
            if (!finalLink && (/download\.php/i.test(href) || href.includes('download.apkmirror.com'))) {
                finalLink = href.startsWith('http') ? href : `https://www.apkmirror.com${href}`;
            }
        });
        const title = $('h1').first().text().trim() || $$('.title').first().text().trim();
        if (finalLink) return { title, downloadUrl: finalLink };
        return { title, pageUrl: dlLink };
    } catch (e) {
        return { title: 'APK', pageUrl: appUrl };
    }
}

/**
 * Generate a list message for WhatsApp
 * @param {Array} items - Array of items with id and text properties
 * @param {string} title - Title for the list
 * @param {string} jid - Group/user JID
 * @param {string} participant - Participant ID
 * @param {string} messageId - Message ID
 * @returns {Object} Message object for WhatsApp
 */
function generateList(items, title, jid, participant, messageId) {
    if (!items || items.length === 0) {
        return {
            message: '❌ No items found',
            type: 'text'
        };
    }

    // Create sections for the list
    const sections = [{
        title: title,
        rows: items.map((item, index) => ({
            title: item.text,
            rowId: item.id,
            description: `Option ${index + 1}`
        }))
    }];

    return {
        message: {
            text: title,
            footer: 'Select an option from the list below',
            title: '📱 APK Search Results',
            buttonText: 'Select APK',
            sections
        },
        type: 'list'
    };
}

module.exports = {
    apkMirror,
    generateList,
    apkGetDownloadInfo
};