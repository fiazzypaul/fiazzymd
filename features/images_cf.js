const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function generateImage(prompt, options = {}) {
  const accountId = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT;
  const token = process.env.CF_API_TOKEN;
  const model = process.env.CF_IMAGE_MODEL || '@cf/stabilityai/stable-diffusion-xl-base-1.0';
  if (!accountId || !token) {
    return { success: false, error: 'Missing Cloudflare credentials' };
  }
  const body = {
    prompt,
    width: options.width || 512,
    height: options.height || 512,
    num_steps: options.num_steps || 20,
    guidance: options.guidance || 7.5,
    seed: options.seed
  };
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  try {
    let resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok && resp.status >= 500) {
      await new Promise(r => setTimeout(r, 750));
      resp = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    if (!resp.ok) {
      const text = await resp.text();
      return { success: false, error: `Cloudflare AI error ${resp.status}: ${text}` };
    }
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = await resp.json();
      if (json.result && json.result.length) {
        const buf = Buffer.from(json.result, 'base64');
        return { success: true, image: buf };
      }
      return { success: false, error: 'Invalid JSON image response' };
    } else {
      const ab = await resp.arrayBuffer();
      const buf = Buffer.from(ab);
      return { success: true, image: buf };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { generateImage };

async function generateImages(prompt, count = 2, options = {}) {
  const images = [];
  for (let i = 0; i < count; i++) {
    const seed = (Date.now() + i) % 2147483647;
    const res = await generateImage(prompt, { ...options, seed });
    if (!res.success) {
      return { success: false, error: res.error };
    }
    images.push(res.image);
  }
  return { success: true, images };
}

module.exports.generateImages = generateImages;