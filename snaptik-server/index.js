// snaptik-server/index.js
// Local TikTok API server using TikWM API
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.SNAP_PORT || 3030;

// STABLE TIKWM API FOR TIKTOK DOWNLOADING
app.get('/tiktok', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.json({ status: false, error: "Missing url" });

        console.log(`📥 TikTok downloading: ${url}`);

        // Use TikWM API - more reliable than scraping
        const apiUrl = 'https://www.tikwm.com/api/';

        const response = await axios.post(apiUrl,
            `url=${encodeURIComponent(url)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 15000
            }
        );

        const data = response.data;

        if (data.code !== 0 || !data.data) {
            console.log('❌ No download data found');
            return res.json({ status: false, error: data.msg || "Failed to get download link" });
        }

        // TikWM returns direct download links
        const downloadUrl = data.data.play || data.data.wmplay || data.data.hdplay;

        if (!downloadUrl) {
            console.log('❌ No download link in response');
            return res.json({ status: false, error: "No download link found" });
        }

        console.log(`✅ Found download link via TikWM`);

        return res.json({
            status: true,
            download: downloadUrl,
            title: data.data.title || '',
            author: data.data.author?.nickname || ''
        });

    } catch (e) {
        console.error('❌ TikTok download error:', e.message);
        return res.json({ status: false, error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 TikTok local server running on port ${PORT}`);
});
