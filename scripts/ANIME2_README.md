# AnimeHeaven Scraper (anime2.js)

## Overview
This script scrapes anime episodes from animeheaven.me following the exact flow you described.

## How It Works

### 1. **Establish Session**
```
GET https://animeheaven.me/
```
- Visits homepage to establish session
- Captures cookies for subsequent requests

### 2. **Search for Anime**
```
GET https://animeheaven.me/fastsearch.php?xhr=1&s=<query>
```
- Searches for anime by name
- Returns list of matching anime with their codes
- Example: `/anime.php?lqode` → code is `lqode`

### 3. **Get Anime Details**
```
GET https://animeheaven.me/anime.php?<code>
```
- Fetches anime page
- Extracts episode gate IDs from `onclick="gate('GATE_ID')"` attributes
- Each episode has a unique gate ID

### 4. **Get Episode Video Source**
```
GET https://animeheaven.me/gate.php
Cookie: key=<GATE_ID>
```
- Uses gate ID as cookie value
- Returns HTML with video sources in `<source>` tags
- Extracts video URLs like: `https://cc.animeheaven.me/video.mp4?...`

### 5. **Download Video**
```
GET https://cc.animeheaven.me/video.mp4?<params>
Range: bytes=0-<chunk_size>
```
- Downloads video in chunks using HTTP Range requests
- Continues downloading until complete
- Supports resumable downloads (206 Partial Content)

## Usage

### Run the test:
```bash
node scripts/anime2.js
```

### What it does:
1. ✅ Establishes session
2. ✅ Searches for "record of ragnarok"
3. ✅ Gets episode list with gate IDs
4. ✅ Extracts video source URL for episode 1
5. ⚠️ Stops before downloading (to save bandwidth)

### To enable actual download:
Uncomment line 366-367 in the script:
```javascript
const outputPath = path.join(__dirname, 'test-episode.mp4');
await scraper.downloadVideo(videoUrl, outputPath);
```

## Key Features

### Session Management
- Captures and maintains cookies
- Uses proper headers to mimic browser behavior

### Episode Extraction
- Parses HTML to find `onclick="gate('...')"` attributes
- Extracts gate IDs automatically

### Chunked Downloads
- Downloads large files in 10MB chunks
- Uses HTTP Range requests for reliability
- Shows progress during download
- **Retry logic**: Automatically retries failed chunks up to 3 times
- **Exponential backoff**: 2s, 4s, 8s delays between retries
- **Network error handling**: Handles ECONNRESET, ETIMEDOUT, and socket hang up errors

### Error Handling
- Saves debug HTML files for troubleshooting
- Comprehensive error messages

## Output Files

### Debug Files (created in scripts/):
- `anime-details-response.html` - Anime page with episode list
- `gate-response.html` - Video page with source URLs
- `test-episode.mp4` - Downloaded video (if enabled)

## Example Output

```
🎬 AnimeHeaven Scraper Test

📡 Establishing session with animeheaven.me...
✅ Session established
🍪 Cookies: PHPSESSID

🔍 Searching for: "record of ragnarok"
✅ Found 3 results
   1. Record of Ragnarok III (lqode)
   2. Record of Ragnarok II (k0gs1)
   3. Record of Ragnarok (pmjbi)

📺 Selected: Record of Ragnarok III

📺 Getting anime details for: lqode
✅ Found 12 episodes
First few episodes:
   1. Episode 2 (b5654aad46e99157b7f4aeb6659e4911)
   2. Episode 1 (1cb8cbcde6c25847fb4738f628013efb)
   ...

🎬 Getting video for: Episode 1

🚪 Getting episode gate: 1cb8cbcde6c25847fb4738f628013efb
✅ Found 3 video sources
   1. unknown - https://cc.animeheaven.me/video.mp4?1cb8cbcde6c25847fb4738f628013efb&...

📹 Video URL: https://cc.animeheaven.me/video.mp4?...

⚠️  Ready to download episode
   Uncomment the download line to proceed
   This will download the full video file

✅ Test completed successfully!
📝 Video sources extracted and ready for download
```

## Notes

- The site uses gate IDs as cookies to authorize video access
- Videos are served with 206 Partial Content for streaming
- The scraper mimics Chrome browser to avoid detection
- Download chunks are 10MB each (configurable)

## Implementation for Bot

To integrate this into your bot:

1. **Search Command**: Use `searchAnime()` to find anime
2. **Episode List**: Use `getAnimeDetails()` to show episodes
3. **Stream/Download**: Use `getEpisodeGate()` to get video URL
4. **Send to User**: Either:
   - Send video URL directly
   - Download and send file
   - Stream using WhatsApp's video message

## API Class

```javascript
const scraper = new AnimeHeavenScraper();

// Search
const results = await scraper.searchAnime('naruto');

// Get episodes
const { episodes } = await scraper.getAnimeDetails(results[0].code);

// Get video
const sources = await scraper.getEpisodeGate(episodes[0].gateId);

// Download
await scraper.downloadVideo(sources[0].url, 'output.mp4');
```

## Dependencies

- axios - HTTP requests
- cheerio - HTML parsing
- fs - File operations
- path - Path handling

All already installed in your project!
