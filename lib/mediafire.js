const axios = require('axios');
const cheerio = require('cheerio');

/**
 * MediaFire download function
 * Extracts direct download link from MediaFire URL
 * @param {string} url - MediaFire URL
 * @returns {Promise<Object>} Download information { url, filename, size }
 */
async function mediafire(url) {
    try {
        if (!url.includes('mediafire.com')) {
            throw new Error('Invalid MediaFire URL');
        }

        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        // Extract download link from MediaFire page
        const downloadLink = $('a[href*="download"]').attr('href') || 
                           $('.download_link').attr('href') ||
                           $('a[id="downloadButton"]').attr('href');
        
        // Extract filename and file size
        const filename = $('.filename').text().trim() || 
                        $('title').text().replace('MediaFire', '').trim() ||
                        'unknown_file';
        
        const fileSize = $('.fileinfo').text().trim() || 
                        $('.file-size').text().trim() ||
                        'Unknown size';
        
        if (!downloadLink) {
            throw new Error('Could not extract download link');
        }

        return {
            url: downloadLink,
            filename: filename,
            size: fileSize
        };
    } catch (error) {
        console.error('MediaFire error:', error.message);
        return null;
    }
}

module.exports = mediafire;