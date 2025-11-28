const fetch = require('node-fetch');

/**
 * Search for movies using The Movie Database (TMDb) API
 * @param {string} query - Search query or keyword
 * @param {number} limit - Number of results to return (default 5)
 * @returns {Promise<Array>} Array of movie results
 */
async function searchMovies(query, limit = 5) {
  try {
    // TMDb API is free but requires an API key
    // For now, we'll use a public demo endpoint or require user to set TMDB_API_KEY
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      throw new Error('TMDB_API_KEY not configured. Please contact bot owner.');
    }

    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&page=1`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDb API error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.results.slice(0, limit);

    return results.map((movie, index) => ({
      number: index + 1,
      title: movie.title,
      year: movie.release_date ? movie.release_date.split('-')[0] : 'N/A',
      rating: movie.vote_average || 'N/A',
      overview: movie.overview || 'No description available',
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      id: movie.id
    }));
  } catch (error) {
    console.error('❌ Movie search error:', error);
    throw error;
  }
}

/**
 * Get trending movies
 * @param {number} limit - Number of results (default 5)
 * @returns {Promise<Array>} Array of trending movies
 */
async function getTrendingMovies(limit = 5) {
  try {
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      throw new Error('TMDB_API_KEY not configured. Please contact bot owner.');
    }

    const url = `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDb API error: ${response.status}`);
    }

    const data = await response.json();
    const results = data.results.slice(0, limit);

    return results.map((movie, index) => ({
      number: index + 1,
      title: movie.title,
      year: movie.release_date ? movie.release_date.split('-')[0] : 'N/A',
      rating: movie.vote_average || 'N/A',
      overview: movie.overview || 'No description available',
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      id: movie.id
    }));
  } catch (error) {
    console.error('❌ Trending movies error:', error);
    throw error;
  }
}

/**
 * Get random popular movie
 * @returns {Promise<Object>} Random movie
 */
async function getRandomMovie() {
  try {
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      throw new Error('TMDB_API_KEY not configured. Please contact bot owner.');
    }

    const randomPage = Math.floor(Math.random() * 5) + 1; // Random page 1-5
    const url = `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&page=${randomPage}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDb API error: ${response.status}`);
    }

    const data = await response.json();
    const randomIndex = Math.floor(Math.random() * data.results.length);
    const movie = data.results[randomIndex];

    return {
      title: movie.title,
      year: movie.release_date ? movie.release_date.split('-')[0] : 'N/A',
      rating: movie.vote_average || 'N/A',
      overview: movie.overview || 'No description available',
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      id: movie.id
    };
  } catch (error) {
    console.error('❌ Random movie error:', error);
    throw error;
  }
}

/**
 * Format movie results as text
 * @param {Array} movies - Array of movie results
 * @param {string} prefix - Bot command prefix
 * @returns {string} Formatted text
 */
function formatMovieResults(movies, prefix) {
  if (!movies || movies.length === 0) {
    return '❌ No movies found! Try a different search term.';
  }

  let text = '🎬 *MOVIE RECOMMENDATIONS*\n\n';

  movies.forEach((movie) => {
    text += `*${movie.number}. ${movie.title}* (${movie.year})\n`;
    text += `   ⭐ Rating: ${movie.rating}/10\n`;
    text += `   📝 ${movie.overview.substring(0, 100)}${movie.overview.length > 100 ? '...' : ''}\n\n`;
  });

  text += `💡 Powered by TMDb`;

  return text;
}

/**
 * Format single movie details
 * @param {Object} movie - Movie object
 * @returns {string} Formatted text
 */
function formatMovieDetails(movie) {
  let text = `🎬 *${movie.title}* (${movie.year})\n\n`;
  text += `⭐ *Rating:* ${movie.rating}/10\n\n`;
  text += `📝 *Overview:*\n${movie.overview}\n\n`;
  text += `💡 Powered by TMDb`;

  return text;
}

module.exports = {
  searchMovies,
  getTrendingMovies,
  getRandomMovie,
  formatMovieResults,
  formatMovieDetails
};
