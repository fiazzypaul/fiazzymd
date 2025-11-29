const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const path = require('path');

/**
 * Search for images using Google Custom Search API
 * Free alternative: Uses SerpAPI free tier or falls back to scraping
 * @param {string} query - Search query
 * @param {number} limit - Number of images to return (default 5, max 10)
 * @returns {Promise<Array<string>>} Array of image URLs
 */
async function searchImages(query, limit = 5) {
  try {
    // Limit between 1 and 10
    limit = Math.max(1, Math.min(limit, 10));

    // Method 1: Try using Google Custom Search API if configured
    const apiKey = process.env.GOOGLE_API_KEY;
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

    if (apiKey && searchEngineId) {
      return await searchWithGoogleAPI(query, limit, apiKey, searchEngineId);
    }

    // Method 2: Fallback to free API (Bing Image Search via unofficial API)
    return await searchWithBingAPI(query, limit);
  } catch (error) {
    console.error('❌ Image search error:', error);
    throw new Error('Failed to search for images');
  }
}

/**
 * Search images using Google Custom Search API
 * Requires GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID in .env
 */
async function searchWithGoogleAPI(query, limit, apiKey, searchEngineId) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&searchType=image&num=${limit}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google API error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('No images found');
  }

  return data.items.map(item => item.link);
}

/**
 * Search images using Bing Image Search (free, no API key required)
 * This uses a public scraping approach
 */
async function searchWithBingAPI(query, limit) {
  // Use Bing image search HTML scraping
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=1&count=${limit}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Bing search failed: ${response.status}`);
  }

  const html = await response.text();

  // Extract image URLs from Bing search results
  const imageUrls = [];
  const regex = /murl&quot;:&quot;([^&]+?)&quot;/g;
  let match;

  while ((match = regex.exec(html)) !== null && imageUrls.length < limit) {
    imageUrls.push(match[1]);
  }

  if (imageUrls.length === 0) {
    throw new Error('No images found');
  }

  return imageUrls.slice(0, limit);
}

/**
 * Download an image from URL
 * @param {string} url - Image URL
 * @param {string} filename - Output filename
 * @returns {Promise<string>} Path to downloaded image
 */
async function downloadImage(url, filename) {
  try {
    const downloadsDir = path.join(__dirname, '..', 'downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
    }

    const buffer = await response.buffer();
    const filepath = path.join(downloadsDir, filename);

    fs.writeFileSync(filepath, buffer);
    return filepath;
  } catch (error) {
    console.error(`❌ Download error for ${url}:`, error.message);
    throw error;
  }
}

/**
 * Download multiple images from URLs
 * @param {Array<string>} urls - Array of image URLs
 * @param {string} query - Search query (for filename)
 * @returns {Promise<Array<string>>} Array of downloaded file paths
 */
async function downloadImages(urls, query) {
  const downloaded = [];
  const sanitizedQuery = query.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);

  for (let i = 0; i < urls.length; i++) {
    try {
      const ext = getImageExtension(urls[i]);
      const filename = `${sanitizedQuery}_${i + 1}${ext}`;
      const filepath = await downloadImage(urls[i], filename);
      downloaded.push(filepath);
    } catch (error) {
      console.log(`⚠️ Skipped image ${i + 1}: ${error.message}`);
      // Continue with next image
    }
  }

  return downloaded;
}

/**
 * Get file extension from URL
 */
function getImageExtension(url) {
  const match = url.match(/\.(jpg|jpeg|png|gif|webp|bmp)/i);
  return match ? match[0] : '.jpg';
}

/**
 * Format search status message
 */
function formatSearchMessage(query, count) {
  return `🔍 *IMAGE SEARCH*\n\n` +
         `📝 Query: ${query}\n` +
         `📊 Downloading ${count} image(s)...\n\n` +
         `⏳ Please wait...`;
}

module.exports = {
  searchImages,
  downloadImages,
  formatSearchMessage
};
