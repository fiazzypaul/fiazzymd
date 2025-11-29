const ytdl = require("ytdl-core");
const fs = require("fs");

/**
 * Download YouTube video as MP4
 * @param {string} url - YouTube video URL
 * @param {string} output - Output file path (default: video.mp4)
 * @returns {Promise<string>} Path to downloaded video file
 */
async function ytmp4(url, output = "video.mp4") {
    return new Promise((resolve, reject) => {
        try {
            if (!ytdl.validateURL(url)) {
                return reject(new Error("Invalid YouTube URL"));
            }

            // Download 360p MP4 (format 18) for better compatibility
            const video = ytdl(url, {
                quality: "18",
                filter: format => format.container === 'mp4'
            });

            video.pipe(fs.createWriteStream(output))
                .on("finish", () => resolve(output))
                .on("error", (err) => reject(err));
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = ytmp4;
