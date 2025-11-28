const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Search for anime using Jikan API (MyAnimeList wrapper)
 * Completely free, no API key required!
 * @param {string} query - Search query or keyword
 * @param {number} limit - Number of results to return (default 5)
 * @returns {Promise<Array>} Array of anime results
 */
async function searchAnime(query, limit = 5) {
  try {
    // Jikan API v4 - Free, no auth required
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=${limit}`;
    let response = await fetch(url);
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      await new Promise(r => setTimeout(r, 750));
      response = await fetch(url);
    }
    if (!response.ok) {
      throw new Error(`Jikan API error: ${response.status}`);
    }
    const data = await response.json();
    const results = data.data || [];

    return results.map((anime, index) => ({
      number: index + 1,
      title: anime.title || anime.title_english || 'Unknown Title',
      year: anime.year || anime.aired?.from?.split('-')[0] || 'N/A',
      rating: anime.score || 'N/A',
      episodes: anime.episodes || '?',
      type: anime.type || 'Unknown',
      status: anime.status || 'Unknown',
      synopsis: anime.synopsis || 'No description available',
      image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || null,
      mal_id: anime.mal_id,
      genres: anime.genres?.map(g => g.name).join(', ') || 'N/A'
    }));
  } catch (error) {
    console.error('❌ Anime search error:', error);
    throw error;
  }
}

/**
 * Get top/popular anime
 * @param {number} limit - Number of results (default 5)
 * @returns {Promise<Array>} Array of top anime
 */
async function getTopAnime(limit = 5) {
  try {
    const url = `https://api.jikan.moe/v4/top/anime?limit=${limit}`;
    let response = await fetch(url);
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      await new Promise(r => setTimeout(r, 750));
      response = await fetch(url);
    }
    if (!response.ok) {
      throw new Error(`Jikan API error: ${response.status}`);
    }
    const data = await response.json();
    const results = data.data || [];

    return results.map((anime, index) => ({
      number: index + 1,
      title: anime.title || anime.title_english || 'Unknown Title',
      year: anime.year || anime.aired?.from?.split('-')[0] || 'N/A',
      rating: anime.score || 'N/A',
      episodes: anime.episodes || '?',
      type: anime.type || 'Unknown',
      status: anime.status || 'Unknown',
      synopsis: anime.synopsis || 'No description available',
      image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || null,
      mal_id: anime.mal_id,
      genres: anime.genres?.map(g => g.name).join(', ') || 'N/A'
    }));
  } catch (error) {
    console.error('❌ Top anime error:', error);
    throw error;
  }
}

/**
 * Get currently airing anime
 * @param {number} limit - Number of results (default 5)
 * @returns {Promise<Array>} Array of seasonal anime
 */
async function getSeasonalAnime(limit = 5) {
  try {
    // Get current season anime
    const url = `https://api.jikan.moe/v4/seasons/now?limit=${limit}`;
    let response = await fetch(url);
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      await new Promise(r => setTimeout(r, 750));
      response = await fetch(url);
    }
    if (!response.ok) {
      throw new Error(`Jikan API error: ${response.status}`);
    }
    const data = await response.json();
    const results = data.data || [];

    return results.map((anime, index) => ({
      number: index + 1,
      title: anime.title || anime.title_english || 'Unknown Title',
      year: anime.year || anime.aired?.from?.split('-')[0] || 'N/A',
      rating: anime.score || 'N/A',
      episodes: anime.episodes || '?',
      type: anime.type || 'Unknown',
      status: anime.status || 'Airing',
      synopsis: anime.synopsis || 'No description available',
      image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || null,
      mal_id: anime.mal_id,
      genres: anime.genres?.map(g => g.name).join(', ') || 'N/A'
    }));
  } catch (error) {
    console.error('❌ Seasonal anime error:', error);
    throw error;
  }
}

/**
 * Get random anime recommendation
 * @returns {Promise<Object>} Random anime
 */
async function getRandomAnime() {
  try {
    const url = `https://api.jikan.moe/v4/random/anime`;
    let response = await fetch(url);
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      await new Promise(r => setTimeout(r, 750));
      response = await fetch(url);
    }
    if (!response.ok) {
      throw new Error(`Jikan API error: ${response.status}`);
    }
    const data = await response.json();
    const anime = data.data;

    return {
      title: anime.title || anime.title_english || 'Unknown Title',
      year: anime.year || anime.aired?.from?.split('-')[0] || 'N/A',
      rating: anime.score || 'N/A',
      episodes: anime.episodes || '?',
      type: anime.type || 'Unknown',
      status: anime.status || 'Unknown',
      synopsis: anime.synopsis || 'No description available',
      image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || null,
      mal_id: anime.mal_id,
      genres: anime.genres?.map(g => g.name).join(', ') || 'N/A'
    };
  } catch (error) {
    console.error('❌ Random anime error:', error);
    throw error;
  }
}

/**
 * Format anime results as text
 * @param {Array} animes - Array of anime results
 * @param {string} prefix - Bot command prefix
 * @returns {string} Formatted text
 */
function formatAnimeResults(animes, prefix) {
  if (!animes || animes.length === 0) {
    return '❌ No anime found! Try a different search term.';
  }

  let text = '📺 *ANIME RECOMMENDATIONS*\n\n';

  animes.forEach((anime) => {
    text += `*${anime.number}. ${anime.title}* (${anime.year})\n`;
    text += `   ⭐ Rating: ${anime.rating}/10 | 📺 ${anime.episodes} eps\n`;
    text += `   🎭 ${anime.genres}\n`;
    text += `   📝 ${anime.synopsis.substring(0, 100)}${anime.synopsis.length > 100 ? '...' : ''}\n\n`;
  });

  text += `💡 Powered by Fiazzy-MD`;

  return text;
}

/**
 * Format single anime details
 * @param {Object} anime - Anime object
 * @returns {string} Formatted text
 */
function formatAnimeDetails(anime) {
  let text = `📺 *${anime.title}* (${anime.year})\n\n`;
  text += `⭐ *Rating:* ${anime.rating}/10\n`;
  text += `📺 *Episodes:* ${anime.episodes}\n`;
  text += `📡 *Status:* ${anime.status}\n`;
  text += `🎭 *Genres:* ${anime.genres}\n\n`;
  text += `📝 *Synopsis:*\n${anime.synopsis}\n\n`;
  text += `💡 Powered by Fiazzy-MD`;

  return text;
}

module.exports = {
  searchAnime,
  getTopAnime,
  getSeasonalAnime,
  getRandomAnime,
  formatAnimeResults,
  formatAnimeDetails
};
