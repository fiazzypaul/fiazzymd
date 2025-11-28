const play = require('play-dl')
const fs = require('fs')
const path = require('path')

const ytIdRegex = /(?:http(?:s|):\/\/|)(?:(?:www\.|)youtube(?:\-nocookie|)\.com\/(?:watch\?.*(?:|\&)v=|embed|shorts\/|v\/)|youtu\.be\/)([-_0-9A-Za-z]{11})/

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

async function ytsSearchText(match) {
  if (!match) return '*Example : yts baymax*'
  const vid = ytIdRegex.exec(match)
  if (vid) {
    const url = `https://www.youtube.com/watch?v=${vid[1]}`
    const info = await play.video_info(url)
    const d = info.video_details
    const title = d.title
    const duration = formatDuration(d.durationInSec || 0)
    const view = d.views || 0
    const published = d.uploadDate || ''
    const description = d.description || ''
    return `*Title :* ${title}\n*Time :* ${duration}\n*Views :* ${view}\n*Publish :* ${published}\n*Desc :* ${description}`
  }
  const results = await play.search(match, { limit: 5, source: { youtube: 'video' } })
  const msg = results
    .map(v => `• *${v.title.trim()}*\n*Views :* ${v.views}\n*Time :* ${formatDuration(v.durationInSec)}\n*Author :* ${v.channel.name}\n*Url :* ${v.url}\n\n`)
    .join('')
  return msg.trim()
}

async function buildSong(match) {
  let url = match
  const vid = ytIdRegex.exec(match)
  if (vid) url = `https://www.youtube.com/watch?v=${vid[1]}`
  const info = await play.video_info(url)
  const title = info.video_details.title
  const downloadsDir = path.join(__dirname, '..', 'downloads')
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true })
  const sanitized = title.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_')
  const outputPath = path.join(downloadsDir, `${sanitized}.mp3`)
  const stream = await play.stream(url, { quality: 2 })
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(outputPath)
    stream.stream.pipe(ws)
    ws.on('finish', resolve)
    ws.on('error', reject)
    stream.stream.on('error', reject)
  })
  return { path: outputPath, fileName: `${sanitized}.mp3`, mimetype: 'audio/mpeg' }
}

async function buildVideo(match) {
  let url = match
  const vid = ytIdRegex.exec(match)
  if (vid) url = `https://www.youtube.com/watch?v=${vid[1]}`
  const info = await play.video_info(url)
  const title = info.video_details.title
  const downloadsDir = path.join(__dirname, '..', 'downloads')
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true })
  const sanitized = title.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_')
  const outputPath = path.join(downloadsDir, `${sanitized}.mp4`)
  const stream = await play.stream(url, { quality: 1 })
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(outputPath)
    stream.stream.pipe(ws)
    ws.on('finish', resolve)
    ws.on('error', reject)
    stream.stream.on('error', reject)
  })
  return { path: outputPath, fileName: `${sanitized}.mp4` }
}

module.exports = { ytsSearchText, buildSong, buildVideo }
