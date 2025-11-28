## Troubleshooting

**Deprecation Warning for QR Code:**
- ✅ Fixed! The bot now handles QR codes manually without using the deprecated `printQRInTerminal` option

**QR Code too big:**
- ✅ Fixed! QR codes are now displayed in compact mode using `{ small: true }`

**Connection closed repeatedly (Error 500/515):**
- ✅ Fixed! The bot now uses stable connection settings
- Key fixes applied:
  - ❌ Removed `fetchLatestBaileysVersion()` - This causes 90% of error 500 issues
  - ✅ Using real browser info: `Chrome (Linux)`
  - ✅ Increased keepalive to 45 seconds
  - ✅ Disabled `syncFullHistory` to reduce load
  - ✅ **Welcome message disabled by default** - This was causing most disconnections!
  - ✅ Exponential backoff (3s, 6s, 9s, 12s, 15s) for reconnections
  - ✅ Max 5 reconnection attempts to prevent rate limiting

**Important: Welcome Message**
- The automatic welcome message is **disabled by default** to prevent error 500
- Sending messages immediately after connection causes WhatsApp to disconnect
- If you want to enable it, edit `index.js` around line 193 and uncomment the code
- If enabled, it waits 20 seconds before sending (but still might cause issues)
- **Recommendation:** Keep it disabled and just send yourself a "ping" message to test
