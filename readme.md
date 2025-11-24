# FiazzyMD WhatsApp Bot

A WhatsApp bot built with Baileys that supports both QR code and pairing code authentication with multi-session management.

## Features

- Connect via QR Code or Pairing Code
- Multi-session management (run multiple WhatsApp accounts)
- Auto-reply to messages
- Built-in commands (ping, hi, help, session)
- Persistent authentication sessions
- Automatic reconnection
- Message logging
- Clean QR code display (no deprecation warnings)

## Installation

```bash
pnpm install
```

## Usage

### Starting the Bot

Simply run:

```bash
pnpm start
```

### Session Management

The bot now includes a session manager that allows you to:
- Create multiple sessions (different WhatsApp accounts)
- Switch between sessions
- Each session is saved in the `sessions/` folder

#### First Time Setup

When you run the bot for the first time:

1. You'll be asked to create a session name (e.g., "session1", "personal", "business")
2. Choose your connection method:
   ```
   ╔════════════════════════════════════╗
   ║   🤖 FiazzyMD WhatsApp Bot Setup   ║
   ╚════════════════════════════════════╝

   Choose your connection method:

     1️⃣  QR Code (Scan with phone)
     2️⃣  Pairing Code (Enter code on phone)

   Enter your choice (1 or 2):
   ```

#### Method 1: QR Code

1. Select option `1` when prompted
2. A compact QR code will appear in your terminal
3. Open WhatsApp on your phone
4. Go to: Settings > Linked Devices > Link a Device
5. Scan the QR code
6. You'll receive a confirmation message in your WhatsApp DM!

#### Method 2: Pairing Code

1. Select option `2` when prompted
2. Enter your phone number (with country code, no + or spaces)
3. A pairing code will be displayed in a nice box format
4. Open WhatsApp on your phone
5. Go to: Settings > Linked Devices > Link a Device > Link with phone number instead
6. Enter the pairing code
7. You'll receive a confirmation message in your WhatsApp DM!

### Using Multiple Sessions

**Single Session (Auto-connect):**
If you only have one session saved, the bot will automatically connect to it without prompting!

```
✅ Auto-connecting to session: fiazzy
```

**Multiple Sessions:**
If you have multiple sessions, you'll see a menu:

```
📂 Available Sessions:

  1. session1
  2. business
  3. Create new session

Select session (1-3):
```

Simply select which session to use, and it will automatically reconnect!

## Available Commands

When someone sends a message to your bot:

- `ping` - Bot replies with "Pong! Bot is active." (includes response time)
- `hi` or `hello` - Bot sends a greeting with command list
- `help` - Shows detailed help menu with all commands
- `session` - View current session information and status

## Project Structure

- `index.js` - Main bot file with session manager
- `sessions/` - Folder containing all session data (created automatically)
  - `session1/` - Example session folder
  - `business/` - Example session folder
- `package.json` - Project dependencies

## Managing Sessions

### Viewing Sessions

All sessions are stored in the `sessions/` folder. Each session has its own subfolder with authentication credentials.

### Deleting a Session

To delete a specific session, simply delete its folder:

**Windows:**
```cmd
rmdir /s /q sessions\session_name
```

**Or manually:**
Navigate to the `sessions/` folder and delete the unwanted session folder.

### Starting Fresh

To clear all sessions and start fresh:

```bash
pnpm clean
```

Note: This will delete the old `auth_info_baileys` folder if it exists (from older versions).

## Customization

Edit [index.js](index.js) to add your own commands and features. Find the command handler section (around line 207):

```javascript
// Add your custom commands in the messages.upsert event handler
const command = messageText.toLowerCase().trim();

if (command === 'mycommand') {
    await sock.sendMessage(msg.key.remoteJid, {
        text: '🎉 My custom response!'
    });
}
```

You can add as many custom commands as you want!

## Dependencies

- `@whiskeysockets/baileys` - WhatsApp Web API
- `qrcode-terminal` - QR code generation for terminal
- `pino` - Logger

## Troubleshooting

**Deprecation Warning for QR Code:**
- ✅ Fixed! The bot now handles QR codes manually without using the deprecated `printQRInTerminal` option

**QR Code too big:**
- ✅ Fixed! QR codes are now displayed in compact mode using `{ small: true }`

**Connection closed repeatedly (Error 500/515):**
- ✅ Fixed! The bot now uses stable connection settings
- Changes made to fix error 500:
  - ❌ Removed `fetchLatestBaileysVersion()` (causes 90% of 500 errors)
  - ✅ Using real browser info: `Chrome (Linux)`
  - ✅ Increased keepalive to 45 seconds
  - ✅ Wait 10 seconds before sending first message
  - ✅ Exponential backoff (3s, 6s, 9s, 12s, 15s) for reconnections
  - ✅ Max 5 reconnection attempts to prevent rate limiting
- If still getting errors:
  - Delete the session folder: `rmdir /s /q sessions\session_name`
  - Reconnect with fresh QR/pairing code
  - Check Windows system time: `w32tm /resync` in CMD

**General connection issues:**
- Check your internet connection
- Ensure WhatsApp Web is not open in your browser (only one connection allowed)
- Try deleting the session folder and reconnecting

**Pairing code not working:**
- Ensure phone number is in correct format (country code without + or spaces)
- Example: For +1 234-567-8900, enter: `12345678900`
- Make sure you're entering the code in WhatsApp within the time limit (usually 1-2 minutes)

**Bot not responding:**
- Check console logs for errors
- Ensure the bot is connected (you'll see "✅ Connected Successfully!" message)
- Verify you received the welcome DM in WhatsApp

**Multiple sessions not working:**
- Make sure each session has a unique name
- Sessions are stored in the `sessions/` folder
- Each session can only be connected to one device at a time
