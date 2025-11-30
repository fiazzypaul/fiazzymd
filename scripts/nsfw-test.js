const axios = require('axios');

async function callWithCategoryAndQuery(url, category, query) {
  const catKeys = ['category', 'cat', 'tag', 'type'];
  const qKeys = ['q', 'query', 'search', 'keyword', 'title', 'name'];
  // Try combinations of category + query params
  for (const ck of catKeys) {
    for (const qk of qKeys) {
      try {
        const start = Date.now();
        const res = await axios.get(url, { timeout: 15000, params: { [ck]: category, [qk]: query } });
        const ms = Date.now() - start;
        return { res, ms, used: `${ck}+${qk}` };
      } catch (e) {}
    }
  }
  // Fallback: category only
  for (const ck of catKeys) {
    try {
      const start = Date.now();
      const res = await axios.get(url, { timeout: 15000, params: { [ck]: category } });
      const ms = Date.now() - start;
      return { res, ms, used: `${ck}` };
    } catch (e) {}
  }
  // Final fallback: no params
  const start = Date.now();
  const res = await axios.get(url, { timeout: 15000 });
  const ms = Date.now() - start;
  return { res, ms, used: 'none' };
}

function extractImageInfo(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.url === 'string') return { url: data.url };
  if (typeof data.image === 'string') return { url: data.image };
  if (Array.isArray(data.images) && data.images.length) return { url: data.images[0] };
  if (data.result && typeof data.result.url === 'string') return { url: data.result.url };
  return null;
}

async function main() {
  const url = 'https://apis.davidcyriltech.my.id/nsfw';
  const category = (process.argv[2] || 'uncensored').toLowerCase();
  const query = (process.argv[3] || 'naruto').toLowerCase();
  try {
    const { res, ms, used } = await callWithCategoryAndQuery(url, category, query);
    const data = res.data || {};
    const success = data.success === true || res.status === 200;
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const imageInfo = extractImageInfo(data);
    console.log('Endpoint:', url);
    console.log('HTTP Status:', res.status);
    console.log('Response Time:', ms + 'ms');
    console.log('Param Used:', used);
    console.log('Filter Category:', category);
    console.log('Query:', query);
    console.log('Success:', !!success);
    if (categories.length) {
      console.log('Categories Count:', categories.length);
      console.log('Contains Filter:', categories.includes(category));
      console.log('First 10 Categories:', categories.slice(0, 10).join(', '));
    }
    if (imageInfo && imageInfo.url) {
      console.log('Image URL:', imageInfo.url);
    }
    process.exit(success ? 0 : 1);
  } catch (e) {
    console.error('Request failed:', e.message);
    process.exit(1);
  }
}

main();