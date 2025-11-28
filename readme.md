# FiazzyMD WhatsApp Bot

A WhatsApp bot built with Baileys that supports both QR code and pairing code authentication with multi-session management.

## Features

- Connect via QR Code or Pairing Code
- Multi-session management (run multiple WhatsApp accounts)
- Auto-connect to single session (no prompts!)
- Environment-based configuration (.env file)
- Public/Private mode (control who can use commands)
- Customizable command prefix
- Built-in commands (.menu, .ping, .help, .session)
- Response time tracking (ping in milliseconds)
- Persistent authentication sessions
- Automatic reconnection with exponential backoff
- Message logging
- Clean QR code display (no deprecation warnings)
- Stable connection (no error 500 loops!)
 - Alive message (global, pretty output)
 - Owner-only global presence (typing/recording/online)
 - Repository info command (.repo)

## Installation

```bash
pnpm install
```

## Configuration

Create a `.env` file in the root directory (or copy from `.env.example`):

```bash
# Copy example env file
copy .env.example .env
```

Edit `.env` with your settings:

```env
# Bot Mode: 'public' or 'private'
BOT_MODE=public

# Bot Prefix (default is ".")
PREFIX=.

# Owner Phone Number (required for private mode)
OWNER_NUMBER=1234567890

# Bot Information
BOT_NAME=FiazzyMD
BOT_VERSION=1.0.0

# Presence (owner-only global)
# WAPRESENCE_STATE: composing | recording | available | paused
WAPRESENCE_STATE=paused

# TMDb API Key for movies (set one of these)
# Primary key
TMDB_API_KEY=your_tmdb_key_here

```

### Configuration Options:

- **BOT_MODE**:
  - `public` - Anyone can use bot commands
  - `private` - Only the owner can use bot commands
- **PREFIX**: The prefix for commands (default: `.`)
- **OWNER_NUMBER**: Your phone number (country code without +)
- **BOT_NAME**: Name of your bot
- **BOT_VERSION**: Version number
- **WAPRESENCE_STATE**: Global presence state (`composing`, `recording`, `available`, `paused`)
- **TMDB_API_KEY**: TMDb key for movie recommendations (recommended)
- **FALLBACK_TMDB_API_KEY**: Optional fallback TMDb key if primary is missing

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

All commands use the prefix set in your `.env` file (default is `.`):

### Main Commands:

- **`.menu`** - Display bot menu with all available commands
  - Shows bot name, version, mode, prefix
  - Lists total number of commands
  - Shows all available commands

- **`.ping`** - Check bot response time
  - Measures ping in milliseconds
  - Shows speed rating (Excellent/Good/Fair)
  - Example output: `Response Time: 145ms`

- **`.help [command]`** - Get help information
  - Without arguments: Shows all commands with descriptions
  - With command name: Shows specific command details
  - Example: `.help ping` shows ping command info

- **`.session`** - View current session information
  - Shows session name
  - Device info
  - Phone number
  - Bot mode (Public/Private)
  - Connection status

- **`.repo`** - Show bot repository link and creator info
  - Link: `https://github.com/fiazzypaul/fiazzymd.git`
  - Creator: `fiazzypaul (2349019151146)`

### Group Management Commands:

- **`.add <number>`** - Add a member to the group
  - Admin only (owner can bypass)
  - Example: `.add 2349012345678`

- **`.kick`** - Remove a member from the group
  - Admin only (owner can bypass)
  - Reply to a message with `.kick` or use `.kick <number>`

- **`.promote`** - Promote a member to admin
  - Admin only (owner can bypass)
  - Reply to a message with `.promote` or use `.promote <number>`

- **`.demote`** - Demote an admin to member
  - Admin only (owner can bypass)
  - Reply to a message with `.demote` or use `.demote <number>`

- **`.tag <message>`** - Tag all members with a message
  - No admin requirement in public mode
  - Owner can always use

- **`.tagall`** - List all members with tags
  - No admin requirement in public mode
  - Owner can always use

- **`.mute [minutes]`** - Mute the group
  - Admin only (owner can bypass)
  - `.mute` - Mutes indefinitely
  - `.mute 30` - Mutes for 30 minutes then auto-unmutes

- **`.unmute`** - Unmute the group
  - Admin only (owner can bypass)
  - Cancels any active auto-unmute timer

- **`.del`** - Delete the replied message
  - Admin only (owner can bypass)
  - Group-only

### Command Examples:

```
.menu
.ping
.help
.help menu
.session
.add 2349012345678
.kick (reply to message)
.promote (reply to message)
.tag Hello everyone!
.mute 30
.unmute
.repo
.alive
.wapresence typing
```

### Permission System:

**Bot Owner (OWNER_NUMBER in .env):**
- Can use ALL commands regardless of bot mode
- Bypasses all admin checks

**Public Mode (BOT_MODE=public):**
- Everyone can use general commands: `.menu`, `.ping`, `.help`, `.session`, `.tag`, `.tagall`
- Only group admins can use: `.add`, `.kick`, `.promote`, `.demote`, `.mute`, `.unmute`
- Owner can always use all commands

**Private Mode (BOT_MODE=private):**
- Only the owner can use all commands
- Other users' commands are silently ignored (no reply)
- Console logs unauthorized attempts

## Project Structure

```
fiazzymd/
├── index.js              # Main bot file with command system
├── .env                  # Your configuration (create from .env.example)
├── .env.example          # Example configuration file
├── package.json          # Project dependencies
├── sessions/             # Session data (auto-created)
│   ├── session1/         # Example session
│   └── business/         # Example session
└── readme.md             # This file
```

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

## Adding Custom Commands

You can easily add your own commands! Edit [index.js](index.js) and add new commands after the existing commands:

```javascript
// Simple command
registerCommand('mycommand', 'Description of my command', async (sock, msg, args) => {
    await sock.sendMessage(msg.key.remoteJid, {
        text: '🎉 My custom response!'
    });
});

// Command with arguments
registerCommand('echo', 'Echo back your message', async (sock, msg, args) => {
    const text = args.join(' ') || 'No message provided';
    await sock.sendMessage(msg.key.remoteJid, {
        text: `📢 You said: ${text}`
    });
});

// Admin-only command (owner can bypass)
registerCommand('admincmd', 'Admin only command', async (sock, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) {
        return await sock.sendMessage(msg.key.remoteJid, {
            text: '❌ This command is only for groups!'
        });
    }

    const senderNumber = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
    const isOwner = senderNumber === config.ownerNumber;

    if (!isOwner) {
        if (config.botMode === 'private') {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ This command is restricted to bot owner in private mode!'
            });
        }

        if (!(await isUserAdmin(sock, msg.key.remoteJid, msg.key.participant))) {
            return await sock.sendMessage(msg.key.remoteJid, {
                text: '❌ Only admins can use this command!'
            });
        }
    }

    await sock.sendMessage(msg.key.remoteJid, {
        text: '✅ Admin command executed!'
    });
});
```

Your commands will automatically:
- Appear in `.menu`
- Work with `.help`
- Respect public/private mode
- Use your configured prefix
- Support owner bypass for admin commands

## Dependencies

- `@whiskeysockets/baileys` - WhatsApp Web API
- `qrcode-terminal` - QR code generation for terminal
- `pino` - Logger
- `dotenv` - Environment variable management

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

**If still getting errors:**
- Delete the session folder: `rmdir /s /q sessions\session_name`
- Reconnect with fresh QR/pairing code
- Check Windows system time: `w32tm /resync` in CMD
- Make sure welcome message is disabled

**General connection issues:**
- Check your internet connection
- Ensure WhatsApp Web is not open in your browser (only one connection allowed)
- Try deleting the session folder and reconnecting

**Pairing code not working:**
- Ensure phone number is in correct format (country code without + or spaces)
- Example: For +1 234-567-8900, enter: `12345678900`
- Make sure you're entering the code in WhatsApp within the time limit (usually 1-2 minutes)

**Bot not responding to commands:**
- ✅ Fixed! The bot now uses a universal message extractor
- Handles all WhatsApp message types (conversation, extended, ephemeral, captions, etc.)
- Make sure you're using the correct prefix (default is `.`)
- Commands must start with prefix: `.menu` not just `menu`
- Check console logs - you should see: `⚡ Executing command: .menu`
- If in private mode, ensure your number matches OWNER_NUMBER in .env

**Admin commands not working:**
- ✅ Fixed! Commands now check if USER is admin, not bot
- Unlike Telegram, WhatsApp doesn't have "bot admin" concept
- Bot owner (OWNER_NUMBER) can bypass all admin checks
- In public mode: group admins can use `.add`, `.kick`, `.promote`, `.demote`, `.mute`, `.unmute`
- In private mode: only bot owner can use commands

**Group commands (.mute, .unmute, .add, etc.) failing:**
- Make sure you're using these commands in a group chat
- Ensure you have admin permissions in the group (or you're the bot owner)
- Check that the bot is still connected (use `.ping` to test)

**Multiple sessions not working:**
- Make sure each session has a unique name
- Sessions are stored in the `sessions/` folder
- Each session can only be connected to one device at a time
