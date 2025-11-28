const axios = require("axios");
const fs = require("fs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("Enter image prompt: ", async (prompt) => {
  console.log("\n🖼️ Generating image... Please wait...\n");

  try {
    const response = await axios.post(
      "https://api.blackbox.ai/api/generate-image",
      {
        prompt: prompt,
        model: "flux" // model used by Blackbox for images
      }
    );

    // The API returns base64 encoded data
    const base64Image = response.data.image;
    if (!base64Image) {
      throw new Error("No image data returned");
    }

    const buffer = Buffer.from(base64Image, "base64");

    if (!fs.existsSync("./images")) {
      fs.mkdirSync("./images");
    }

    const filename = `./images/output_${Date.now()}.png`;
    fs.writeFileSync(filename, buffer);

    console.log(`✅ Image saved to: ${filename}`);
  } catch (err) {
    console.log("❌ Error generating image:", err.response?.status, err.response?.data || err.message);
  }

  rl.close();
});
