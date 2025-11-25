module.exports = (config) => {
  const groupAdminCommands = new Set(['add', 'kick', 'promote', 'demote', 'mute', 'unmute', 'warn', 'antilink', 'warnlimit', 'tag', 'tagall', 'resetwarn']);
  const groupOnlyCommands = new Set(['add', 'kick', 'promote', 'demote', 'mute', 'unmute', 'tag', 'tagall', 'warn', 'antilink', 'warnlimit', 'resetwarn']);
  const generalCommands = new Set(['menu', 'ping', 'help', 'session', 'vv']);
  const varCommands = new Set(['autoviewonce']); // Commands that modify global .env settings

  const isGroup = (jid) => jid.endsWith('@g.us');

  // Helper to normalize numbers to bare digits (removes country codes, suffixes, etc.)
  const normalizeNumber = (num) => String(num).replace(/[^0-9]/g, '');

  const getSenderNumber = (msg) => {
    // This part extracts the bare number (e.g., '2349133961422') or the internal ID (e.g., '280689517846702')
    const part = msg.key.participant ? msg.key.participant.split('@')[0] : msg.key.remoteJid.split('@')[0];
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
    const senderNumber = getSenderNumber(msg);
    
    // Check if the extracted sender number (either bare number or LID) 
    // matches the *normalized* owner number.
    const normalizedOwner = normalizeNumber(config.ownerNumber);
    const isOwner = senderNumber.startsWith(normalizedOwner); // Use startsWith to handle LIDs

    // Bot Owner Bypass
    if (isOwner) return { allowed: true };

    // This block only runs if isOwner is false, restricting varCommands to everyone else.
    if (varCommands.has(cmdName)) {
      return { allowed: false, reason: '❌ Only the bot owner can use this command!' };
    }

    if (config.botMode === 'private') {
      return { allowed: false, reason: '❌ This command is restricted to bot owner in private mode!' };
    }

    const inGroup = isGroup(msg.key.remoteJid);
    if (groupOnlyCommands.has(cmdName) && !inGroup) {
      return { allowed: false, reason: '❌ This command is only for groups!' };
    }

    if (groupAdminCommands.has(cmdName)) {
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