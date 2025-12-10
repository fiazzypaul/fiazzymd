const axios = require('axios');

// OpenWeatherMap API key
const API_KEY = '4902c0f2550f58298ad4146a92b65e10';

/**
 * Get weather data for a city
 * @param {string} city - City name or "city,country"
 * @returns {Promise<Object>} Weather data
 */
async function getWeather(city) {
    if (!city || city.trim().length === 0) {
        throw new Error('City name is required');
    }

    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
        const response = await axios.get(url, { timeout: 10000 });

        if (response.data.cod !== 200) {
            throw new Error('City not found');
        }

        return response.data;
    } catch (error) {
        if (error.response) {
            if (error.response.status === 404) {
                throw new Error('City not found');
            } else if (error.response.status === 401) {
                throw new Error('Invalid API key');
            }
        }
        console.error('Weather API error:', error);
        throw new Error('Failed to fetch weather data');
    }
}

/**
 * Get weather forecast for a city (5 days)
 * @param {string} city - City name or "city,country"
 * @returns {Promise<Object>} Forecast data
 */
async function getForecast(city) {
    if (!city || city.trim().length === 0) {
        throw new Error('City name is required');
    }

    try {
        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
        const response = await axios.get(url, { timeout: 10000 });

        if (response.data.cod !== '200') {
            throw new Error('City not found');
        }

        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            throw new Error('City not found');
        }
        console.error('Forecast API error:', error);
        throw new Error('Failed to fetch forecast data');
    }
}

/**
 * Format weather data for display
 * @param {Object} data - Weather API response
 * @returns {string} Formatted weather message
 */
function formatWeather(data) {
    const weather = data.weather[0];
    const temp = Math.round(data.main.temp);
    const feelsLike = Math.round(data.main.feels_like);
    const tempMin = Math.round(data.main.temp_min);
    const tempMax = Math.round(data.main.temp_max);
    const humidity = data.main.humidity;
    const pressure = data.main.pressure;
    const windSpeed = (data.wind.speed * 3.6).toFixed(1); // Convert m/s to km/h
    const visibility = (data.visibility / 1000).toFixed(1); // Convert m to km

    // Weather emoji mapping
    const weatherEmoji = {
        'Clear': '☀️',
        'Clouds': '☁️',
        'Rain': '🌧️',
        'Drizzle': '🌦️',
        'Thunderstorm': '⛈️',
        'Snow': '❄️',
        'Mist': '🌫️',
        'Fog': '🌫️',
        'Haze': '🌫️',
        'Smoke': '🌫️',
        'Dust': '🌫️',
        'Sand': '🌫️',
        'Ash': '🌫️',
        'Squall': '💨',
        'Tornado': '🌪️'
    };

    const emoji = weatherEmoji[weather.main] || '🌡️';

    let message = `${emoji} *WEATHER REPORT*\n\n`;
    message += `📍 *Location:* ${data.name}, ${data.sys.country}\n`;
    message += `🌤️ *Condition:* ${weather.description.charAt(0).toUpperCase() + weather.description.slice(1)}\n\n`;

    message += `🌡️ *Temperature:*\n`;
    message += `   Current: ${temp}°C\n`;
    message += `   Feels like: ${feelsLike}°C\n`;
    message += `   Min: ${tempMin}°C | Max: ${tempMax}°C\n\n`;

    message += `💧 *Humidity:* ${humidity}%\n`;
    message += `🌀 *Pressure:* ${pressure} hPa\n`;
    message += `💨 *Wind Speed:* ${windSpeed} km/h\n`;
    message += `👁️ *Visibility:* ${visibility} km\n\n`;

    // Sunrise/Sunset times
    const sunrise = new Date(data.sys.sunrise * 1000).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    const sunset = new Date(data.sys.sunset * 1000).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    message += `🌅 Sunrise: ${sunrise}\n`;
    message += `🌇 Sunset: ${sunset}`;

    return message;
}

/**
 * Format forecast data for display
 * @param {Object} data - Forecast API response
 * @returns {string} Formatted forecast message
 */
function formatForecast(data) {
    const city = data.city;
    let message = `📅 *5-DAY FORECAST*\n\n`;
    message += `📍 *Location:* ${city.name}, ${city.country}\n\n`;

    // Group forecasts by day
    const dailyForecasts = {};

    data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (!dailyForecasts[dateKey]) {
            dailyForecasts[dateKey] = {
                temps: [],
                conditions: [],
                date: dateKey
            };
        }

        dailyForecasts[dateKey].temps.push(item.main.temp);
        dailyForecasts[dateKey].conditions.push(item.weather[0].main);
    });

    // Display first 5 days
    let count = 0;
    for (const [dateKey, forecast] of Object.entries(dailyForecasts)) {
        if (count >= 5) break;

        const minTemp = Math.round(Math.min(...forecast.temps));
        const maxTemp = Math.round(Math.max(...forecast.temps));
        const condition = forecast.conditions[Math.floor(forecast.conditions.length / 2)];

        const weatherEmoji = {
            'Clear': '☀️',
            'Clouds': '☁️',
            'Rain': '🌧️',
            'Drizzle': '🌦️',
            'Thunderstorm': '⛈️',
            'Snow': '❄️'
        };

        const emoji = weatherEmoji[condition] || '🌡️';

        message += `${emoji} *${dateKey}*\n`;
        message += `   ${minTemp}°C - ${maxTemp}°C | ${condition}\n\n`;

        count++;
    }

    message += `💡 Use \`.weather <city>\` for current weather`;

    return message;
}

module.exports = {
    getWeather,
    getForecast,
    formatWeather,
    formatForecast
};
