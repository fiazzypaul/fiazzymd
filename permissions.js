module.exports = (config) => {
  const groupAdminCommands = new Set(['add', 'kick', 'kickall', 'promote', 'demote', 'mute', 'unmute', 'warn', 'antilink', 'warnlimit', 'tag', 'tagall', 'resetwarn', 'welcome', 'del']);
  const groupOnlyCommands = new Set(['add', 'kick', 'kickall', 'promote', 'demote', 'mute', 'unmute', 'tag', 'tagall', 'warn', 'antilink', 'warnlimit', 'resetwarn', 'welcome', 'del']);
  const generalCommands = new Set(['menu', 'ping', 'help', 'session', 'vv', 'sticker', 'img', 'movie', 'anime', 'alive']);
  const varCommands = new Set(['autoviewonce', 'setvar', 'mode', 'prefix', 'ownernumber', 'seevar', 'antidelete', 'wapresence']); // Commands that modify global .env settings

  const isGroup = (jid) => jid.endsWith('@g.us');

  // Helper to normalize numbers to bare digits (removes country codes, suffixes, etc.)
  const normalizeNumber = (num) => String(num).replace(/[^0-9]/g, '');

  const getSenderNumber = (msg) => {
    // In groups, msg.key.participant contains the sender's JID
    // In DMs, msg.key.remoteJid contains the sender's JID
    const jid = msg.key.participant || msg.key.remoteJid;

    // Extract the number part before '@'
    const part = jid.split('@')[0];

    // LIDs (Lidded IDs) are internal WhatsApp IDs that don't match phone numbers
    // They're typically shorter numeric strings (like '85796837155033')
    // We need to check if this is a LID or actual phone number

    // If it's in a group, also check the pushName or verifiedBizName for owner detection
    // But for now, return the part as-is
    return part;
  };

  const isUserAdmin = async (sock, groupJid, userJid) => {
    try {
      const meta = await sock.groupMetadata(groupJid);
      const p = meta.participants.find((x) => x.id === userJid);
      return p?.admin === 'admin' || p?.admin === 'superadmin';
    } catch {
      return false;
    }
  };

  const canRunCommand = async (sock, msg, cmdName) => {
    // Get the sender's JID (full WhatsApp ID)
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderNumber = senderJid.split('@')[0];

    // Get bot's own number from sock.user or config
    let botOwnerNumber = config.ownerNumber;

    // If sock.user exists, use it as the authoritative source
    if (sock.user) {
      botOwnerNumber = sock.user.id.split(':')[0];
    }

    // Normalize both numbers for comparison
    const normalizedOwner = normalizeNumber(botOwnerNumber);
    const normalizedSender = normalizeNumber(senderNumber);

    // Check if sender is owner by comparing numbers
    // This works even with LIDs because we check if sender JID contains owner number
    let isOwner = false;

    // Method 1: Exact number match
    if (normalizedSender === normalizedOwner) {
      isOwner = true;
    }

    // Method 2: Check if sender JID contains owner number (handles @lid and @s.whatsapp.net)
    if (!isOwner && senderJid.includes(normalizedOwner)) {
      isOwner = true;
    }

    // Method 3: For groups, check if bot is sending to itself
    if (!isOwner && sock.user) {
      const isGroup = msg.key.remoteJid.endsWith('@g.us');
      if (isGroup && msg.key.participant) {
        // In groups, check if participant contains the owner number
        isOwner = msg.key.participant.includes(normalizedOwner);
      }

      // Method 4: Check if message is from the bot's own number (fromMe)
      if (!isOwner && msg.key.fromMe) {
        isOwner = true;
      }
    }

    console.log('🔍 Owner Check:', {
      senderJid,
      senderNumber,
      botOwnerNumber,
      normalizedOwner,
      normalizedSender,
      isOwner
    });

    // Bot Owner Bypass - Owner can run ANY command in ANY mode, ANYWHERE
    if (isOwner) return { allowed: true };

    // Non-owner users: Check var commands first
    if (varCommands.has(cmdName)) {
      return { allowed: false, reason: '❌ Only the bot owner can use this command!' };
    }

    // Non-owner users: Private mode blocks all commands silently
    if (config.botMode === 'private') {
      return { allowed: false, silent: true };
    }

    // Public mode: Check group-only commands
    const inGroup = isGroup(msg.key.remoteJid);
    if (groupOnlyCommands.has(cmdName) && !inGroup) {
      return { allowed: false, reason: '❌ This command is only for groups!' };
    }

    // Public mode: Check admin commands (in groups)
    if (groupAdminCommands.has(cmdName) && inGroup) {
      const userJid = msg.key.participant;
      const isAdmin = await isUserAdmin(sock, msg.key.remoteJid, userJid);
      if (!isAdmin) return { allowed: false, reason: '❌ Only admins can use this command!' };
    }

    return { allowed: true };
  };

  return {
    groupAdminCommands,
    groupOnlyCommands,
    generalCommands,
    varCommands,
    isGroup,
    getSenderNumber,
    isUserAdmin,
    canRunCommand,
  };
};