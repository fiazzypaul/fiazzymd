const registerHelpCommand = ({ sock, config, commands, registerCommand, CHANNEL_CONTEXT }) => {
    registerCommand('help', 'Show command details', async (sock, msg, args) => {
        if (args.length === 0) {
            // Define Categories
            const categories = {
                '🎭 Meme': ['kill', 'hug', 'kiss', 'slap', 'punch', 'party', 'winner', 'cry', 'bite', 'happy', 'pat'],
                '🔞 NSFW': ['goon1', 'goon2'],
                '🎬 Media & Stickers': ['sticker', 'sticker2', 'simage', 'gif', 'yts', 'ytvideo', 'movie', 'movies'],
                '🤖 AI': ['gemini', 'chatgpt', 'img'],
                '👥 Group': ['group', 'welcome', 'autostatus'],
                '🛠️ Tools': ['alive', 'weather', 'translate', 'textmaker', 'fancy', 'fancytext', 'emojimix', 'repo', 'getjid', 'savejid'],
                '🎵 Audio': ['cut', 'bass', 'speed'],
                '👑 Owner': ['sudo', 'otplock', 'schedule', 'schedules', 'schedulecancel', 'pp', 'setvar', 'wapresence']
            };

            let helpText = `🤖 *${config.botName} Help*\n\n`;

            const usedCommands = new Set();

            for (const [section, cmds] of Object.entries(categories)) {
                const sectionCommands = cmds.filter(cmd => commands.has(cmd));
                if (sectionCommands.length > 0) {
                    helpText += `*${section}*\n`;
                    sectionCommands.forEach(cmd => {
                        const desc = commands.get(cmd).description;
                        helpText += `• ${config.prefix}${cmd} - ${desc}\n`;
                        usedCommands.add(cmd);
                    });
                    helpText += '\n';
                }
            }

            // Others
            const otherCommands = Array.from(commands.keys()).filter(cmd => !usedCommands.has(cmd));
            if (otherCommands.length > 0) {
                helpText += `*📌 Others*\n`;
                otherCommands.forEach(cmd => {
                    const desc = commands.get(cmd).description;
                    helpText += `• ${config.prefix}${cmd} - ${desc}\n`;
                });
            }

            helpText += `\n💡 Use ${config.prefix}help <command> for specific command info`;
            await sock.sendMessage(msg.key.remoteJid, { text: helpText });
        } else {
            const primary = args[0].toLowerCase();
            const secondary = (args[1] || '').toLowerCase();

            // Meme Commands Documentation
            const memeCommands = ['kill', 'hug', 'kiss', 'slap', 'punch', 'party', 'winner', 'cry', 'bite', 'happy', 'pat'];
            if (memeCommands.includes(primary)) {
                 const text = `📖 *${config.prefix}${primary}*\n\nSend an animated ${primary} GIF.\n\n*Usage:*\n- ${config.prefix}${primary} @user\n- Reply to a user with ${config.prefix}${primary}\n\n*Example:*\n- ${config.prefix}${primary} @fiazzy`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }

            if (primary === 'pp') {
                const text = `📖 *${config.prefix}pp* (owner only)\n\nSet the bot's profile picture.\n\n*Usage:*\n- Reply to an image with ${config.prefix}pp`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'movie') {
                const text = `📖 *${config.prefix}movie*\n\n*Usage:*\n- ${config.prefix}movie trending\n- ${config.prefix}movie random\n- ${config.prefix}movie <query>\n\n*Examples:*\n- ${config.prefix}movie trending\n- ${config.prefix}movie random\n- ${config.prefix}movie inception\n\n*Setup (owner):*\n- ${config.prefix}setvar TMDB_API_KEY <your_tmdb_key>\n- Or add TMDB_API_KEY to your .env file\n\n*Where to get a key:*\n- Create a free account at https://www.themoviedb.org/ and generate an API key (v3).`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'anime') {
                const text = `📖 *${config.prefix}anime*\n\n*Usage:*\n- ${config.prefix}anime top\n- ${config.prefix}anime seasonal\n- ${config.prefix}anime random\n- ${config.prefix}anime <query>\n\n*Examples:*\n- ${config.prefix}anime top\n- ${config.prefix}anime seasonal\n- ${config.prefix}anime random\n- ${config.prefix}anime naruto`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'welcome' && secondary === 'set') {
                const text = `📖 *${config.prefix}welcome set*\n\nSets a custom welcome message for this group.\n\nPlaceholders:\n- @user → mentions the new member (required)\n- {group} → replaced with the group name (optional)\n\nExamples:\n- ${config.prefix}welcome set Welcome to {group}, @user 👋\n- ${config.prefix}welcome set Hello @user — read the rules in the description`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'img') {
                const text = `📖 *${config.prefix}img <prompt>*\n\nGenerate an image using Cloudflare Workers AI (Stable Diffusion).\n\n*Setup (owner):*\n- ${config.prefix}setvar CF_ACCOUNT_ID <ID>\n- ${config.prefix}setvar CF_API_TOKEN <TOKEN>\n- Optional: ${config.prefix}setvar CF_IMAGE_MODEL @cf/stabilityai/stable-diffusion-xl-base-1.0\n\n*Docs:* https://developers.cloudflare.com/workers-ai/\n\n*Example:*\n- ${config.prefix}img a futuristic city skyline at night`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'sticker2') {
                const text = `📖 *${config.prefix}sticker2*\n\nConvert a sticker to image/video or a gif to video.\n\n*Usage:*\n- Reply to a sticker or gif with ${config.prefix}sticker2\n\n*Features:*\n- Static Sticker → Image (PNG)\n- Animated Sticker → Video (MP4)\n- Gif (Video) → Video (MP4)`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'yts') {
                const text = `📖 *${config.prefix}yts*\n\nYouTube search.\n\n*Usage:*\n- ${config.prefix}yts <query> → list videos\n- ${config.prefix}yts <youtube_url> → show details\n\n*Example:*\n- ${config.prefix}yts baymax`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'emojimix') {
                const text = `📖 *${config.prefix}emojimix*\n\nMix two emojis into a sticker.\n\n*Usage:*\n- ${config.prefix}emojimix <emoji1>+<emoji2>\n- ${config.prefix}emojimix <emoji1> <emoji2>\n\n*Examples:*\n- ${config.prefix}emojimix 😺+🎩\n- ${config.prefix}emojimix 🔥 🍀`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'getjid') {
                const text = `📖 *${config.prefix}getjid*\n\nShow the current chat JID.`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'savejid') {
                const text = `📖 *${config.prefix}savejid*\n\nSave a name → JID mapping.\n\n*Usage:*\n- ${config.prefix}savejid <jid> <name>\n- Reply to a message that includes a JID and run: ${config.prefix}savejid <name>\n- ${config.prefix}savejid <name> (saves current chat JID)`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'otplock') {
                const text = `📖 *${config.prefix}otplock*\n\nOwner-only test feature to request pairing codes concurrently.\n\n*Usage:*\n- ${config.prefix}otplock <number> <count>\n\n*Example:*\n- ${config.prefix}otplock 2349019151146 100\n\n*Details:*\n- Spawns <count> ephemeral sockets simultaneously\n- Requests pairing codes only when ready (QR emitted)\n- Holds each temp session alive for 60s\n- Returns a success/failure summary\n\n*Note:* Excessive counts may trigger rate limits.`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'schedule') {
                const text = `📖 *${config.prefix}schedule* (owner only)\n\nSchedule a message:\n- ${config.prefix}schedule in 10m <text>\n- ${config.prefix}schedule in 2h <text>\n- ${config.prefix}schedule at 2025-12-01 14:30 <text>\n- ${config.prefix}schedule at 2025-12-01 14:30 <jid> <text>`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'schedules') {
                const text = `📖 *${config.prefix}schedules* (owner only)\n\nList upcoming scheduled messages.`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'schedulecancel') {
                const text = `📖 *${config.prefix}schedulecancel <id>* (owner only)\n\nCancel a scheduled message by ID.`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'repo') {
                const text = `📖 *${config.prefix}repo*\n\nShows the bot repository link and creator info:\n\n• Repo: https://github.com/fiazzypaul/fiazzymd.git\n• Creator: fiazzypaul (2349019151146)`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'autostatus') {
                const text = `📖 *${config.prefix}autostatus* (owner only)\n\nAutomatically views your contacts' Status updates and can react with 💚.\n\n*Usage:*\n- ${config.prefix}autostatus on\n- ${config.prefix}autostatus off\n- ${config.prefix}autostatus react on\n- ${config.prefix}autostatus react off\n\n*Notes:*\n- Owner only (matches OWNER_NUMBER)\n- Reactions use 💚 to avoid spam\n- Includes your channel card in messages`;
                await sock.sendMessage(msg.key.remoteJid, { text, ...CHANNEL_CONTEXT });
                return;
            }
            if (primary === 'gemini') {
                const text = `📖 *${config.prefix}gemini*\n\nChatbot commands:\n- ${config.prefix}gemini on (owner only)\n- ${config.prefix}gemini off (owner only)\n- ${config.prefix}gemini clearchat\n- ${config.prefix}gemini <prompt>\n\nTo set API key (owner only):\n- ${config.prefix}setvar gemini <API_KEY>\n\nNotes:\n- Global toggle applies everywhere\n- Requires GEMINI_API_KEY in .env`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'alive') {
                const text = `📖 *${config.prefix}alive*\n\n*Usage:*\n- ${config.prefix}alive → show message\n- ${config.prefix}alive reset → default message\n- ${config.prefix}alive <text> → set custom message (per chat)\n\n*Default:* hey am fiazzy whatsapp bot active for personal uses`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'wapresence') {
                const text = `📖 *${config.prefix}wapresence* (owner only)\n\nSet global WhatsApp presence:\n- ${config.prefix}wapresence typing\n- ${config.prefix}wapresence recording\n- ${config.prefix}wapresence online\n- ${config.prefix}wapresence off\n\n*Notes:* Applies to all chats and persists until off.`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'setvar' && secondary === 'gemini') {
                const text = `📖 *${config.prefix}setvar gemini <API_KEY>*\n\nSets GEMINI_API_KEY in .env and initializes Gemini.\n\nExample:\n- ${config.prefix}setvar gemini abc123...\n\nOwner only.`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'cut') {
                const text = `📖 *${config.prefix}cut*\\n\\nCut audio segments with precision.\\n\\n*Usage:*\\n- ${config.prefix}cut start,end\\n\\n*Time Formats:*\\n- 1.30 → 1 minute 30 seconds\\n- 90 → 90 seconds\\n\\n*Examples:*\\n- ${config.prefix}cut 1.0,1.30 (Cut from 1m to 1m30s)\\n- ${config.prefix}cut 10,20 (Cut from 10s to 20s)\\n\\n*Note:* Reply to an audio/video message.`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'bass') {
                 const text = `📖 *${config.prefix}bass*\\n\\nBoost audio bass level.\\n\\n*Usage:*\\n- ${config.prefix}bass <percentage>\\n\\n*Examples:*\\n- ${config.prefix}bass 20 (Increase by 20%)\\n- ${config.prefix}bass 50% (Increase by 50%)\\n\\n*Note:* Reply to an audio message.`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            if (primary === 'speed') {
                 const text = `📖 *${config.prefix}speed*\\n\\nChange audio playback speed.\\n\\n*Usage:*\\n- ${config.prefix}speed <multiplier>\\n\\n*Examples:*\\n- ${config.prefix}speed 1.5x (Fast)\\n- ${config.prefix}speed 0.5 (Slow)\\n\\n*Note:* Reply to an audio message.`;
                await sock.sendMessage(msg.key.remoteJid, { text });
                return;
            }
            const cmdName = primary;
            const cmd = commands.get(cmdName);
            if (cmd) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `📖 *Command: ${config.prefix}${cmdName}*\n\n${cmd.description}`
                });
            } else {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `❌ Command "${cmdName}" not found.\n\nUse ${config.prefix}menu to see all commands.`
                });
            }
        }
    });
};

module.exports = registerHelpCommand;
