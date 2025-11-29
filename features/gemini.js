const fs = require('fs')
const path = require('path')
const { GoogleGenAI } = require('@google/genai')

const dbDir = path.join(__dirname, '..', 'database')
const file = path.join(dbDir, 'gemini.json')

try { if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true }) } catch {}
try { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}), 'utf8') } catch {}

function loadDB() {
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || '{}') } catch { return {} }
}

function saveDB(db) { try { fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8') } catch {} }

function enableChat(jid) { const db = loadDB(); db[jid] = { enabled: true }; saveDB(db) }
function disableChat(jid) { const db = loadDB(); if (db[jid]) delete db[jid]; saveDB(db) }
function isChatEnabled(jid) { return process.env.GEMINI_ENABLED === 'true' }

const chatSessions = new Map()
let ai = null

function initializeGemini() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return false
  ai = new GoogleGenAI({ apiKey })
  return true
}

async function sendMessage(jid, prompt) {
  if (!ai) { if (!initializeGemini()) return '❌ Gemini API Key not set. Use `.setvar gemini YOUR_API_KEY` to set it.' }
  let chat = chatSessions.get(jid)
  if (!chat) {
    chat = ai.chats.create({ model: 'gemini-2.5-flash', config: { systemInstruction: 'Persona and Goal:
- Persona: A helpful, friendly, and conversational WhatsApp chatbot.
- Primary Goal: To assist the user while maintaining a casual, brief, and mobile-friendly tone.

RULES:
1. Language Identification and Response: You MUST internally identify the user's language (including Nigerian local languages) to understand the meaning, but you MUST respond ONLY in English. Do not translate the user's original message in the final output.
2. Tone and Empathy: Analyze the user's message for its tone (e.g., happy, frustrated, confused, urgent) and adjust your reply to match or respond appropriately (e.g., offer empathy if frustrated or confusing language).
3. Current Events and Knowledge: When asked about current events, real-time information, or complex data, use the Google Search tool to look it up before providing the answer.
4. Brevity: Keep your responses concise and suitable for a mobile chat interface, prioritizing directness over lengthy explanations. ' } })
    chatSessions.set(jid, chat)
  }
  try {
    const response = await chat.sendMessage({ message: prompt })
    return response.text
  } catch (e) {
    chatSessions.delete(jid)
    return '⚠️ Error communicating with Gemini. Chat session cleared. Try again.'
  }
}

/**
 * Generates images based on a text prompt
 * NOTE: Image generation requires Vertex AI access or special API configuration
 * Standard Gemini API keys from AI Studio do not support image generation
 * @param {string} prompt - The text description for the image
 * @param {number} numberOfImages - Number of images to generate (1-4, default 2)
 * @returns {Promise<{success: boolean, images?: Array<Buffer>, error?: string}>}
 */
async function generateImage(prompt, numberOfImages = 2) {
  // Return informative error - image generation not available with standard API keys
  return {
    success: false,
    error: '❌ *Image Generation Not Available*\n\n' +
           '📋 *Reason:* Image generation requires Google Cloud Vertex AI access, which is not available with standard Gemini API keys.\n\n' +
           '💡 *Alternative Solutions:*\n' +
           '1. Use Vertex AI with a Google Cloud project (paid service)\n' +
           '2. Use alternative image generation APIs (DALL-E, Stable Diffusion, etc.)\n' +
           '3. Use image generation web services and integrate via API\n\n' +
           '⚠️ The bot owner needs to configure a Vertex AI project or use a different image generation service.\n\n' +
           '_This feature is temporarily unavailable with the current API configuration._'
  }

  /*
   * DISABLED CODE - Requires Vertex AI or special configuration
   *
  if (!ai) {
    if (!initializeGemini()) {
      return { success: false, error: '❌ Gemini API Key not set. Please contact the bot owner to configure the API key.' }
    }
  }

  // Validate number of images
  if (numberOfImages < 1 || numberOfImages > 4) {
    numberOfImages = 2
  }

  try {
    // Attempt 1: Try Imagen model (requires Vertex AI)
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: prompt,
      config: {
        numberOfImages: numberOfImages,
        outputMimeType: 'image/jpeg',
        aspectRatio: '1:1',
      },
    })

    const images = response.generatedImages.map(img =>
      Buffer.from(img.image.imageBytes, 'base64')
    )

    return { success: true, images }

  } catch (e) {
    console.error('❌ Image Generation Error:', e)

    // Handle specific error cases
    if (e.message && e.message.includes('429')) {
      return {
        success: false,
        error: '⚠️ Rate limit reached! The Gemini API quota has been exceeded. Please try again later or contact the bot owner.'
      }
    }

    if (e.message && e.message.includes('quota')) {
      return {
        success: false,
        error: '⚠️ API quota exhausted! The daily/monthly limit has been reached. Please try again tomorrow or contact the bot owner.'
      }
    }

    if (e.message && e.message.includes('SAFETY')) {
      return {
        success: false,
        error: '⚠️ Your prompt was blocked by content safety filters. Please try a different, appropriate prompt.'
      }
    }

    if (e.message && e.message.includes('invalid')) {
      return {
        success: false,
        error: '⚠️ Invalid request. Please provide a clear, descriptive prompt for the image.'
      }
    }

    // Generic error
    return {
      success: false,
      error: `⚠️ Failed to generate image: ${e.message || 'Unknown error'}. Please try again or contact the bot owner.`
    }
  }
  */
}

function clearChatHistory(jid) { return chatSessions.delete(jid) }

module.exports = { initializeGemini, enableChat, disableChat, isChatEnabled, sendMessage, clearChatHistory, generateImage }
