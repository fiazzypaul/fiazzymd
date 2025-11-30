let sharp = null;
try { sharp = require('sharp'); } catch {}
let ffmpeg = null;
let ffmpegPath = null;
try { ffmpeg = require('fluent-ffmpeg'); ffmpegPath = require('@ffmpeg-installer/ffmpeg').path; if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath); } catch {}

async function createStickerBuffer(inputBuffer, pack = 'FIAZZY-MD', author = 'fiazzypaul') {
  try {
    let StickerModule;
    try { StickerModule = require('wa-sticker-formatter'); } catch {}
    if (StickerModule) {
      const { Sticker, StickerTypes } = StickerModule;
      const sticker = new Sticker(inputBuffer, { pack, author, type: StickerTypes.DEFAULT, quality: 80 });
      const buf = await sticker.toBuffer();
      return buf;
    }
  } catch (err) {
    console.log('wa-sticker-formatter failed — using fallback converters.');
  }
  try {
    if (sharp) {
      try {
        return await sharp(inputBuffer).resize(512, 512, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
      } catch (e) {
        console.log('sharp failed — continuing...');
      }
    }
    if (ffmpeg && ffmpegPath) {
      const fs = require('fs');
      const path = require('path');
      const tmpDir = path.join(__dirname, '..', 'tmp');
      try { if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
      const inputPath = path.join(tmpDir, `st_in_${Date.now()}.jpg`);
      const outputPath = path.join(tmpDir, `st_out_${Date.now()}.webp`);
      fs.writeFileSync(inputPath, inputBuffer);
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-vcodec libwebp',
            '-vf scale=512:512:force_original_aspect_ratio=decrease,fps=15'
          ])
          .save(outputPath)
          .on('end', resolve)
          .on('error', reject);
      });
      const out = fs.readFileSync(outputPath);
      try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch {}
      return out;
    }
    throw new Error('Sticker conversion failed');
  } catch (e) {
    throw e;
  }
}

module.exports = { createStickerBuffer };