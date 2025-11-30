const fs = require('fs')
const path = require('path')
let ffmpeg = null
let ffmpegPath = null
try { ffmpeg = require('fluent-ffmpeg'); ffmpegPath = require('@ffmpeg-installer/ffmpeg').path; if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath); } catch {}

async function convertVideoToGif(inputBuffer, opts = {}) {
  const maxSeconds = opts.maxSeconds || 8
  const tmpDir = path.join(__dirname, '..', 'tmp')
  try { if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true }) } catch {}
  const inPath = path.join(tmpDir, `gif_in_${Date.now()}.mp4`)
  const outPath = path.join(tmpDir, `gif_out_${Date.now()}.mp4`)
  fs.writeFileSync(inPath, inputBuffer)
  const duration = await new Promise((resolve) => {
    if (!ffmpeg) return resolve(null)
    try {
      ffmpeg.ffprobe(inPath, (err, data) => {
        if (err) return resolve(null)
        const d = (data && data.format && data.format.duration) || null
        resolve(d)
      })
    } catch { resolve(null) }
  })
  if (duration && duration > maxSeconds) {
    try { fs.unlinkSync(inPath) } catch {}
    throw new Error(`Video too long (max ${maxSeconds}s)`) 
  }
  await new Promise((resolve, reject) => {
    if (!ffmpeg) return reject(new Error('FFmpeg unavailable'))
    ffmpeg(inPath)
      .noAudio()
      .outputOptions([
        `-t ${maxSeconds}`,
        '-movflags faststart',
        '-pix_fmt yuv420p',
        '-vf scale=512:-2:force_original_aspect_ratio=decrease,fps=15',
        '-preset veryfast',
        '-crf 28'
      ])
      .videoCodec('libx264')
      .format('mp4')
      .save(outPath)
      .on('end', resolve)
      .on('error', reject)
  })
  const out = fs.readFileSync(outPath)
  try { fs.unlinkSync(inPath); fs.unlinkSync(outPath) } catch {}
  return out
}

module.exports = { convertVideoToGif }
