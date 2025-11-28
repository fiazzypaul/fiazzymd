const fs = require('fs');
const path = require('path');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const dbDir = path.join(__dirname, '..', 'database');
const file = path.join(dbDir, 'chatgpt.json');

try { if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true }); } catch {}
try { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}), 'utf8'); } catch {}

function loadDB() { try { return JSON.parse(fs.readFileSync(file, 'utf8') || '{}') } catch { return {} } }
function saveDB(db) { try { fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8') } catch {} }

const chatSessions = new Map();

function initializeChatGPT() { return !!process.env.OPENAI_API_KEY }
function isChatEnabled() { return process.env.GPT_ENABLED === 'true' }

function clearChatHistory(jid) { return chatSessions.delete(jid) }

async function sendMessage(jid, prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return '❌ ChatGPT API Key not set. Use .setvar OPENAI_API_KEY <KEY> or .setvar gpt <KEY>'; 
  }

  let messages = chatSessions.get(jid) || [{ role: 'system', content: 'You are a helpful and friendly chatbot integrated into a WhatsApp bot. Keep responses concise and relevant.' }];
  messages.push({ role: 'user', content: prompt });

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages
      })
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text);
    }
    const data = await resp.json();
    const responseText = data.choices?.[0]?.message?.content || '⚠️ No response';
    messages.push({ role: 'assistant', content: responseText });
    const maxHistory = 21;
    if (messages.length > maxHistory) messages = [messages[0], ...messages.slice(messages.length - (maxHistory - 1))];
    chatSessions.set(jid, messages);
    return responseText;
  } catch (e) {
    console.error('ChatGPT API Error:', e.message);
    chatSessions.delete(jid);
    return '⚠️ An error occurred with the ChatGPT API. Your chat session has been cleared. Ensure your API key and billing are correct.';
  }
}

module.exports = {
  initializeChatGPT,
  isChatEnabled,
  clearChatHistory,
  sendMessage,
};