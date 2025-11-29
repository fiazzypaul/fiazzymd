const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);
const fs = require("fs");

/**
 * Download YouTube video as MP3 audio
 * @param {string} url - YouTube video URL
 * @param {string} output - Output file path (default: audio.mp3)
 * @returns {Promise<string>} Path to downloaded audio file
 */
async function ytmp3(url, output = "audio.mp3") {
    return new Promise(async (resolve, reject) => {
        try {
            if (!ytdl.validateURL(url)) {
                return reject(new Error("Invalid YouTube URL"));
            }

            const stream = ytdl(url, {
                filter: "audioonly",
                quality: "highestaudio"
            });

            ffmpeg(stream)
                .audioBitrate(128)
                .save(output)
                .on("end", () => resolve(output))
                .on("error", (err) => reject(err));
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = ytmp3;
