const axios = require('axios');
const crypto = require('crypto');

// ================================
// PUT YOUR SPOTIFY BEARER HERE
// ================================
const SPOTIFY_BEARER = 'BQDrzWoarswhnBm3mKuLHgK7NWfF574mr_0BSXJuDMoWtj7QeQtaYWuuseRkQH35VLMCSwfo16j69GQK5ePOBJkdnOfFXKG6PXwfou1nPNgTwtCcAXkVRhB2s08_g8DP0xYGar9mVXY';


const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Encoding': 'identity'
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
};

const searchSessions = new Map();

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise((r) => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}

function buildClientTokenPayload() {
    const deviceId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    return {
        client_data: {
            client_version: '1.2.84.233.g7a9a8e95',
            client_id: 'd8a5ed958d274c2e8ee717e6a4b0971d',
            js_sdk_data: {
                device_brand: 'unknown',
                device_model: 'unknown',
                os: 'windows',
                os_version: 'NT 10.0',
                device_id: deviceId,
                device_type: 'computer'
            }
        }
    };
}

async function getClientToken() {
    const url = 'https://clienttoken.spotify.com/v1/clienttoken';
    const payload = buildClientTokenPayload();

    const res = await axios.post(url, payload, {
        timeout: 15000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        headers: {
            'User-Agent': UA,
            Accept: 'application/json',
            'Accept-Encoding': 'identity',
            'Content-Type': 'application/json',
            Origin: 'https://open.spotify.com',
            Referer: 'https://open.spotify.com/',
            'Cache-Control': 'no-cache'
        },
        validateStatus: (s) => s < 500
    });

    if (!res.data || res.status !== 200 || !res.data.granted_token || !res.data.granted_token.token) {
        throw new Error('clienttoken failed');
    }
    return res.data.granted_token.token;
}

async function searchTracksRaw({ bearer, clientToken, query }) {
    const url = 'https://api-partner.spotify.com/pathfinder/v2/query';

    const body = {
        operationName: 'searchTracks',
        variables: {
            searchTerm: query,
            numberOfTopResults: 20,
            limit: 20,
            offset: 0,
            includePreReleases: false,
            includeAudiobooks: true,
            includeAuthors: false
        },
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: '131fd38c13431be963a851082dca0108a4200998b886e7e9d20a21fc51a36aaf'
            }
        }
    };

    const res = await axios.post(url, body, {
        timeout: 15000,
        headers: {
            'User-Agent': UA,
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearer}`,
            'Client-Token': clientToken,
            Origin: 'https://open.spotify.com'
        }
    });

    if (res.status !== 200) throw new Error('search failed');
    return res.data;
}

function extractTracksFromResponse(json) {
    const items =
        json?.data?.searchV2?.tracksV2?.items ||
        json?.data?.searchV2?.tracks?.items ||
        [];

    return items.map(e => e?.item?.data).filter(Boolean).map(t => {
        const artist = t.artists?.items?.[0]?.profile?.name || '';
        const uri = t.uri;
        const id = uri?.split(':')[2];
        return {
            name: t.name,
            artist,
            durationMs: t.duration?.totalMilliseconds,
            url: id ? `https://open.spotify.com/track/${id}` : null
        };
    });
}

function formatDurationMs(ms) {
    if (!ms) return 'Unknown';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function searchSpotifyTracks(query) {
    const bearer = SPOTIFY_BEARER;

    if (!bearer) throw new Error('Set SPOTIFY_BEARER at top of spotify.js');

    const clientToken = await getClientToken();
    const json = await searchTracksRaw({ bearer, clientToken, query });
    return extractTracksFromResponse(json);
}

async function getSpotifyDownloadByUrl(spotifyUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/spotify?url=${encodeURIComponent(spotifyUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    const data = res && res.data ? res.data : null;
    if (!data || data.status === false || !data.result || !data.result.download || !data.result.download.url) {
        throw new Error('Spotify downloader returned no download URL');
    }
    return {
        title: data.result.title || '',
        artist: data.result.artist || '',
        image: data.result.image || '',
        audioUrl: data.result.download.url
    };
}

function storeSearchSession(userKey, results) {
    searchSessions.set(userKey, {
        results,
        timestamp: Date.now()
    });

    setTimeout(() => {
        searchSessions.delete(userKey);
    }, 5 * 60 * 1000);
}

function getSearchSession(userKey) {
    return searchSessions.get(userKey) || null;
}

function clearSearchSession(userKey) {
    searchSessions.delete(userKey);
}

function sanitizeFileName(name) {
    if (!name) return 'track';
    const cleaned = name.replace(/[\\/:*?"<>|]/g, '').trim();
    if (!cleaned) return 'track';
    return cleaned.substring(0, 80);
}

async function spotifyCommand(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const userId = msg.key.participant || msg.key.remoteJid;

    const query = args && Array.isArray(args) ? args.join(' ').trim() : '';

    if (!query) {
        await sock.sendMessage(
            chatId,
            {
                text: 'Usage: .spotify <song/artist/keywords>\nExample: .spotify chris effect'
            },
            { quoted: msg }
        );
        return;
    }

    try {
        await sock.sendMessage(
            chatId,
            {
                text: `🔍 Searching Spotify for: *${query}*\n\n⏳ Please wait...`
            },
            { quoted: msg }
        );

        const tracks = await searchSpotifyTracks(query);

        if (!tracks || tracks.length === 0) {
            await sock.sendMessage(
                chatId,
                {
                    text: `❌ No Spotify tracks found for: *${query}*\n\nTry a different search term.`
                },
                { quoted: msg }
            );
            return;
        }

        const top = tracks.slice(0, 5);
        const storageKey = `${chatId}:${userId}`;
        storeSearchSession(storageKey, top);

        const lines = top.map((t, idx) => {
            const idxStr = idx + 1;
            const title = t.name || 'Unknown title';
            const artist = t.artist || 'Unknown artist';
            const duration = formatDurationMs(t.durationMs);
            return `${idxStr}. ${title}\n   👤 ${artist}\n   ⏱ ${duration}`;
        });

        const messageText =
            `🎵 *SPOTIFY RESULTS*\n\n` +
            `Query: *${query}*\n\n` +
            lines.join('\n\n') +
            `\n\nReply with a number (1-${top.length}) to download.`;

        await sock.sendMessage(
            chatId,
            {
                text: messageText
            },
            { quoted: msg }
        );
    } catch (error) {
        console.error('[SPOTIFY] search error:', error && error.message ? error.message : error);
        await sock.sendMessage(
            chatId,
            { text: 'Failed to search Spotify. Try again later.' },
            { quoted: msg }
        );
    }
}

async function downloadTrackSelection(sock, chatId, msg, selectedTrack) {
    const info = await getSpotifyDownloadByUrl(selectedTrack.url);

    const title = info.title || selectedTrack.name || 'Unknown Title';
    const artist = info.artist || selectedTrack.artist || '';
    const durationLabel = formatDurationMs(selectedTrack.durationMs);

    const safeNameBase = sanitizeFileName(title);

    const audioMsg = await sock.sendMessage(
        chatId,
        {
            audio: { url: info.audioUrl },
            mimetype: 'audio/mpeg',
            fileName: `${safeNameBase}.mp3`
        },
        { quoted: msg }
    );

    const detailsLines = [];
    if (title) detailsLines.push(`🎵 ${title}`);
    if (artist) detailsLines.push(`👤 ${artist}`);
    if (durationLabel) detailsLines.push(`⏱ ${durationLabel}`);
    const detailsText = detailsLines.join('\n');

    if (detailsText) {
        await sock.sendMessage(
            chatId,
            {
                text: detailsText
            },
            { quoted: audioMsg }
        );
    }
}

module.exports = {
    searchSpotifyTracks,
    spotifyCommand,
    getSearchSession,
    clearSearchSession,
    downloadTrackSelection
};
