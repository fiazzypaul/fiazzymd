// const { enableWelcome, disableWelcome } = require('./welcome');
module.exports = function registerGroupCommands(params) {
  const { sock, config, Permissions, registerCommand, muteTimers, warnLimits, warnCounts, antiLinkSettings } = params;
  const sockInst = sock;
  const isGroup = Permissions.isGroup;
  const isUserAdmin = (sockInst, groupJid, userJid) => {
    return Permissions.isUserAdmin(sockInst, groupJid, userJid);
  };

  const isOwnerMsg = (msg) => {
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const normalizedOwner = String(config.ownerNumber).replace(/[^0-9]/g, '');
    const normalizedSender = senderJid.split('@')[0].replace(/[^0-9]/g, '');
    return normalizedSender === normalizedOwner || senderJid.includes(normalizedOwner) || msg.key.fromMe;
  };

  registerCommand('invite', 'Get group invite link', async (sockInst, msg) => {
    if (!isGroup(msg.key.remoteJid)) {
      await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' });
      return;
    }
    const ownerBypass = isOwnerMsg(msg);
    if (!ownerBypass) {
      const admin = await isUserAdmin(sockInst, msg.key.remoteJid, msg.key.participant);
      if (!admin) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Only admins can use this command!' }); return; }
    }
    try {
      const code = await sockInst.groupInviteCode(msg.key.remoteJid);
      const link = `https://chat.whatsapp.com/${code}`;
      await sockInst.sendMessage(msg.key.remoteJid, { text: `🔗 Group Invite: ${link}` });
    } catch (e) {
      await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed to get invite link: ${e.message}` });
    }
  });

  registerCommand('add', 'Add a member to the group', async (sockInst, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    const ownerBypass = isOwnerMsg(msg);
    if (!ownerBypass) { const admin = await isUserAdmin(sockInst, msg.key.remoteJid, msg.key.participant); if (!admin) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Only admins can use this command!' }); return; } }
    const number = (args[0] || '').replace(/[^0-9]/g, '');
    if (!number) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Provide a valid phone number (with country code, digits only)' }); return; }
    const userJid = `${number}@s.whatsapp.net`;
    try {
      const res = await sockInst.groupParticipantsUpdate(msg.key.remoteJid, [userJid], 'add');
      const status = res?.[0]?.status;
      
      // Debug logging for privacy blocked responses
      console.log('📋 groupParticipantsUpdate response:', JSON.stringify(res, null, 2));
      console.log('🔍 Status:', status);
      console.log('🔍 Full response object:', res);
      if (String(status) === '200') {
        await sockInst.sendMessage(msg.key.remoteJid, { text: `✅ Added @${number}`, mentions: [userJid] });
      } else if (String(status) === '403') {
        // Privacy blocked - extract user-specific invite code from response
        try {
          console.log('⚠️ User privacy blocked. Extracting user-specific invite code...');
          
          // Extract the user-specific invite code from the response
          // The response structure shows add_request is nested in content.content[0]
          const content = res?.[0]?.content;
          const addRequest = content?.content?.[0]; // add_request is the first item in content array
          const inviteCode = addRequest?.attrs?.code;
          const expiration = addRequest?.attrs?.expiration;
          
          console.log('📋 Extracted content:', content);
          console.log('📋 Extracted addRequest:', addRequest);
          console.log('🔑 Invite code:', inviteCode);
          console.log('📅 Expiration:', expiration);
          
          if (!inviteCode) {
            console.log('❌ No user-specific invite code found in response, falling back to regular group invite...');
            // Fallback to regular group invite if no user-specific code
            const fallbackCode = await sockInst.groupInviteCode(msg.key.remoteJid);
            const inviteLink = `https://chat.whatsapp.com/${fallbackCode}`;
            
            await sockInst.sendMessage(userJid, {
              text: `📨 *GROUP INVITATION*

⚠️ Cannot add you directly due to your privacy settings

🔗 *Click here to join:*
${inviteLink}

⏰ *Expires in:* 3 days`
            });
            
            await sockInst.sendMessage(msg.key.remoteJid, {
              text: `⚠️ Could not add @${number} due to privacy settings. Sent fallback invite link.`,
              mentions: [userJid]
            });
            return;
          }
          
          console.log('✅ Found user-specific invite code:', inviteCode);
          console.log('📅 Expiration timestamp:', expiration);
          
          // Get group metadata for the invite message
          let groupName = 'the group';
          let groupDesc = '';
          try {
            const groupMeta = await sockInst.groupMetadata(msg.key.remoteJid);
            groupName = groupMeta.subject || 'the group';
            groupDesc = groupMeta.desc || '';
          } catch (e) {
            // Use defaults if metadata fetch fails
          }
          
          // Create proper group invite message structure
          // Send groupInviteMessage directly as the message content
          const inviteMessage = {
            groupJid: msg.key.remoteJid,
            inviteCode: inviteCode,
            inviteExpiration: expiration || Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60), // 3 days default
            groupName: groupName,
            caption: `📨 You are invited to join ${groupName}`
            // Remove jpegThumbnail field to avoid media type issues
          };
          
          console.log('📤 Creating invite message:', JSON.stringify(inviteMessage, null, 2));
          console.log('📤 Sending user-specific invite card...');
          
          // Send the invite card to the user using groupInviteMessage type
          // Try using relayMessage instead of sendMessage to avoid media type issues
          try {
            const messageKey = {
              remoteJid: userJid,
              fromMe: true,
              id: require('crypto').randomBytes(16).toString('hex')
            };
            
            const message = {
              key: messageKey,
              message: {
                groupInviteMessage: inviteMessage
              },
              messageTimestamp: Math.floor(Date.now() / 1000)
            };
            
            console.log('📤 Using relayMessage to send invite...');
            await sockInst.relayMessage(userJid, message.message, { messageId: messageKey.id });
            console.log('✅ Invite card sent via relayMessage!');
          } catch (relayError) {
            console.log('❌ relayMessage failed, trying alternative approach:', relayError.message);
            
            // Alternative: Use extendedTextMessage with context info for invite
            try {
              const contextInfo = {
                groupInviteMessage: inviteMessage
              };
              
              await sockInst.sendMessage(userJid, {
                text: `📨 *GROUP INVITATION*

⚠️ Cannot add you directly due to your privacy settings

🎯 *You are invited to join:*
*${groupName}*

🔗 *Invite Code:* ${inviteCode}

⏰ *Expires in:* 3 days`,
                contextInfo: contextInfo
              });
              console.log('✅ Invite sent via extendedTextMessage with context!');
            } catch (altError) {
              console.log('❌ Alternative approach failed, final fallback to simple text:', altError.message);
              // Final fallback to simple text with invite link
              await sockInst.sendMessage(userJid, {
                text: `📨 *GROUP INVITATION*

⚠️ Cannot add you directly due to your privacy settings

🎯 *You are invited to join:*
*${groupName}*

🔗 *Invite Code:* ${inviteCode}

⏰ *Expires in:* 3 days

💡 Use this code to join the group via WhatsApp's invite feature.`
              });
            }
          }
          
          // Notify in group with mention
          await sockInst.sendMessage(msg.key.remoteJid, {
            text: `⚠️ Could not add @${number} due to privacy settings.

📨 A user-specific invite has been sent to the user.`,
            mentions: [userJid]
          });
          
          console.log('✅ User-specific invite card sent successfully!');
          
        } catch (inviteError) {
          console.error('❌ Error sending user-specific invite:', inviteError);
          // Final fallback to regular text invite
          try {
            const fallbackCode = await sockInst.groupInviteCode(msg.key.remoteJid);
            const inviteLink = `https://chat.whatsapp.com/${fallbackCode}`;
            await sockInst.sendMessage(userJid, {
              text: `📨 *GROUP INVITATION*

⚠️ Cannot add you directly due to your privacy settings

🔗 *Click here to join:*
${inviteLink}

⏰ *Expires in:* 3 days`
            });
          } catch (finalError) {
            console.error('❌ Final fallback failed:', finalError);
            await sockInst.sendMessage(msg.key.remoteJid, { 
              text: `⚠️ Privacy blocked, and failed to generate any invite link: ${finalError.message}` 
            });
          }
        }
      } else {
        await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed to add (${status || 'unknown'})` });
      }
    } catch (e) {
      await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Error: ${e.message}` });
    }
  });

  registerCommand('kick', 'Remove a member from the group', async (sockInst, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    const ownerBypass = isOwnerMsg(msg);
    if (!ownerBypass) { const admin = await isUserAdmin(sockInst, msg.key.remoteJid, msg.key.participant); if (!admin) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Only admins can use this command!' }); return; } }
    let targetJid = null;
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    else if (args[0]) targetJid = `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    if (!targetJid) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Reply or provide a number to kick' }); return; }
    try { await sockInst.groupParticipantsUpdate(msg.key.remoteJid, [targetJid], 'remove'); await sockInst.sendMessage(msg.key.remoteJid, { text: `✅ Removed @${targetJid.split('@')[0]}`, mentions: [targetJid] }); } catch (e) { await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed: ${e.message}` }); }
  });

  registerCommand('kickall', 'Remove all non-admin members', async (sockInst, msg) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    const ownerBypass = isOwnerMsg(msg);
    if (!ownerBypass) { const admin = await isUserAdmin(sockInst, msg.key.remoteJid, msg.key.participant); if (!admin) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Only admins can use this command!' }); return; } }
    try {
      const meta = await sockInst.groupMetadata(msg.key.remoteJid);
      const botJid = sockInst.user.id.split(':')[0] + '@s.whatsapp.net';
      const toKick = meta.participants.filter(p => !p.admin && p.id !== botJid).map(p => p.id);
      if (!toKick.length) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ No non-admin members to remove' }); return; }
      await sockInst.sendMessage(msg.key.remoteJid, { text: `⏳ Removing ${toKick.length} members...` });
      await sockInst.groupParticipantsUpdate(msg.key.remoteJid, toKick, 'remove');
      await sockInst.sendMessage(msg.key.remoteJid, { text: `✅ Removed ${toKick.length} members` });
    } catch (e) { await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed: ${e.message}` }); }
  });

  registerCommand('promote', 'Promote a member to admin', async (sockInst, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    const ownerBypass = isOwnerMsg(msg);
    if (!ownerBypass) { const admin = await isUserAdmin(sockInst, msg.key.remoteJid, msg.key.participant); if (!admin) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Only admins can use this command!' }); return; } }
    let targetJid = null;
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    else if (args[0]) targetJid = `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    if (!targetJid) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Reply or provide a number to promote' }); return; }
    try { await sockInst.groupParticipantsUpdate(msg.key.remoteJid, [targetJid], 'promote'); await sockInst.sendMessage(msg.key.remoteJid, { text: `✅ Promoted @${targetJid.split('@')[0]}`, mentions: [targetJid] }); } catch (e) { await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed: ${e.message}` }); }
  });

  registerCommand('demote', 'Demote an admin to member', async (sockInst, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    const ownerBypass = isOwnerMsg(msg);
    if (!ownerBypass) { const admin = await isUserAdmin(sockInst, msg.key.remoteJid, msg.key.participant); if (!admin) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Only admins can use this command!' }); return; } }
    let targetJid = null;
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    else if (args[0]) targetJid = `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    if (!targetJid) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Reply or provide a number to demote' }); return; }
    try { await sockInst.groupParticipantsUpdate(msg.key.remoteJid, [targetJid], 'demote'); await sockInst.sendMessage(msg.key.remoteJid, { text: `✅ Demoted @${targetJid.split('@')[0]}`, mentions: [targetJid] }); } catch (e) { await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed: ${e.message}` }); }
  });

  registerCommand('mute', 'Mute the group', async (sockInst, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    const ownerBypass = isOwnerMsg(msg);
    if (!ownerBypass) { const admin = await isUserAdmin(sockInst, msg.key.remoteJid, msg.key.participant); if (!admin) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Only admins can use this command!' }); return; } }
    const minutes = args[0] ? parseInt(args[0]) : 0;
    if (args[0] && (isNaN(minutes) || minutes <= 0)) { await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Provide a valid number of minutes or omit to mute indefinitely.` }); return; }
    try {
      await sockInst.groupSettingUpdate(msg.key.remoteJid, 'announcement');
      if (muteTimers && minutes > 0) {
        if (muteTimers.has(msg.key.remoteJid)) { clearTimeout(muteTimers.get(msg.key.remoteJid)); muteTimers.delete(msg.key.remoteJid); }
        const t = setTimeout(async () => { try { await sockInst.groupSettingUpdate(msg.key.remoteJid, 'not_announcement'); await sockInst.sendMessage(msg.key.remoteJid, { text: '🔊 Group Auto-Unmuted' }); } catch {} finally { muteTimers.delete(msg.key.remoteJid); } }, minutes * 60 * 1000);
        muteTimers.set(msg.key.remoteJid, t);
        await sockInst.sendMessage(msg.key.remoteJid, { text: `🔇 Group Muted for ${minutes} minute(s)` });
      } else {
        await sockInst.sendMessage(msg.key.remoteJid, { text: '🔇 Group Muted. Use .unmute to unmute.' });
      }
    } catch (e) { await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed: ${e.message}` }); }
  });

  registerCommand('unmute', 'Unmute the group', async (sockInst, msg) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    const ownerBypass = isOwnerMsg(msg);
    if (!ownerBypass) { const admin = await isUserAdmin(sockInst, msg.key.remoteJid, msg.key.participant); if (!admin) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Only admins can use this command!' }); return; } }
    try {
      if (muteTimers && muteTimers.has(msg.key.remoteJid)) { clearTimeout(muteTimers.get(msg.key.remoteJid)); muteTimers.delete(msg.key.remoteJid); }
      await sockInst.groupSettingUpdate(msg.key.remoteJid, 'not_announcement');
      await sockInst.sendMessage(msg.key.remoteJid, { text: '🔊 Group Unmuted' });
    } catch (e) { await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed: ${e.message}` }); }
  });

  registerCommand('tag', 'Tag all members with a message', async (sockInst, msg, args) => {
    let tagMessage = args.join(' ').trim() || 'Tagged by admin';
    if (!tagMessage && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const quotedText = msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation || msg.message.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage?.text;
      tagMessage = quotedText || 'Tagged by admin';
    }
    try { const meta = await sockInst.groupMetadata(msg.key.remoteJid); const participants = meta.participants.map(p => p.id); await sockInst.sendMessage(msg.key.remoteJid, { text: `📢 *${tagMessage}*`, mentions: participants }); } catch (e) { await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed: ${e.message}` }); }
  });

  registerCommand('tagall', 'List all members with tags', async (sockInst, msg) => {
    try { const meta = await sockInst.groupMetadata(msg.key.remoteJid); const parts = meta.participants; let text = '╭─────────────────────╮\n│  👥 *GROUP MEMBERS*  │\n╰─────────────────────╯\n\n'; parts.forEach((p,i)=>{ text += `${i+1}. @${p.id.split('@')[0]}\n`; }); text += `\n*Total Members:* ${parts.length}`; await sockInst.sendMessage(msg.key.remoteJid, { text, mentions: parts.map(p=>p.id) }); } catch (e) { await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed: ${e.message}` }); }
  });

  registerCommand('warn', 'Warn a user in the group', async (sockInst, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    let targetJid = null;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (ctx?.participant) targetJid = ctx.participant; else if (ctx?.mentionedJid?.length) targetJid = ctx.mentionedJid[0]; else if (args[0]) { const num = args[0].replace(/[^0-9]/g,''); if (num) targetJid = `${num}@s.whatsapp.net`; }
    if (!targetJid) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Specify a user to warn (reply or mention)' }); return; }
    const limit = warnLimits.get(msg.key.remoteJid) || 3;
    const groupMap = warnCounts.get(msg.key.remoteJid) || new Map();
    const c = (groupMap.get(targetJid) || 0) + 1; groupMap.set(targetJid, c); warnCounts.set(msg.key.remoteJid, groupMap);
    if (c >= limit) { try { await sockInst.groupParticipantsUpdate(msg.key.remoteJid, [targetJid], 'remove'); await sockInst.sendMessage(msg.key.remoteJid, { text: `⛔ Warn limit reached. Kicked @${targetJid.split('@')[0]}`, mentions: [targetJid] }); } catch (e) { await sockInst.sendMessage(msg.key.remoteJid, { text: `⚠️ Failed to kick: ${e.message}` }); } } else { await sockInst.sendMessage(msg.key.remoteJid, { text: `⚠️ Warned @${targetJid.split('@')[0]} (${c}/${limit})`, mentions: [targetJid] }); }
  });

  registerCommand('resetwarn', 'Reset warnings for a user', async (sockInst, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    let targetJid = null; const ctx = msg.message?.extendedTextMessage?.contextInfo; if (ctx?.participant) targetJid = ctx.participant; else if (ctx?.mentionedJid?.length) targetJid = ctx.mentionedJid[0]; else if (args[0]) { const num = args[0].replace(/[^0-9]/g,''); if (num) targetJid = `${num}@s.whatsapp.net`; }
    if (!targetJid) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Reply or mention a user to reset warnings' }); return; }
    const groupMap = warnCounts.get(msg.key.remoteJid) || new Map(); const prev = groupMap.get(targetJid) || 0; groupMap.delete(targetJid); warnCounts.set(msg.key.remoteJid, groupMap);
    await sockInst.sendMessage(msg.key.remoteJid, { text: `✅ Reset warnings for @${targetJid.split('@')[0]} (had ${prev})`, mentions: [targetJid] });
  });

  registerCommand('warnlimit', 'Set warn limit for this group', async (sockInst, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    if (!args[0]) { const current = warnLimits.get(msg.key.remoteJid) || 3; await sockInst.sendMessage(msg.key.remoteJid, { text: `📊 Current warn limit: ${current}\n\nUse ${config.prefix}warnlimit <number>` }); return; }
    const n = parseInt(args[0]); if (isNaN(n) || n < 1) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Provide a valid number (1 or more)' }); return; }
    warnLimits.set(msg.key.remoteJid, n); await sockInst.sendMessage(msg.key.remoteJid, { text: `✅ Warn limit set to ${n}` });
  });

  registerCommand('antilink', 'Toggle anti-link for this chat', async (sockInst, msg, args) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    const sub = (args[0] || '').toLowerCase(); const actionArg = (args[1] || '').toLowerCase(); const current = antiLinkSettings.get(msg.key.remoteJid) || { enabled: false, action: 'warn' };
    if (sub === 'on') { current.enabled = true; current.action = actionArg === 'kick' ? 'kick' : 'warn'; antiLinkSettings.set(msg.key.remoteJid, current); await sockInst.sendMessage(msg.key.remoteJid, { text: `✅ Anti-link enabled (${current.action})` }); }
    else if (sub === 'off') { current.enabled = false; antiLinkSettings.set(msg.key.remoteJid, current); await sockInst.sendMessage(msg.key.remoteJid, { text: '✅ Anti-link disabled' }); }
    else { await sockInst.sendMessage(msg.key.remoteJid, { text: `📊 Anti-link is ${current.enabled ? 'ON' : 'OFF'} (${current.action})\n\nUse ${config.prefix}antilink on [warn|kick] or ${config.prefix}antilink off` }); }
  });

  registerCommand('welcome', 'Enable/disable/set welcome messages (group only)', async (sockInst, msg, args) => {
    const { enableWelcome, disableWelcome, setWelcomeMessage, validateWelcomeTemplate } = require('./welcome');
    const chatId = msg.key.remoteJid; if (!isGroup(chatId)) { await sockInst.sendMessage(chatId, { text: '❌ This command only works in groups' }); return; }
    const sub = (args[0] || '').toLowerCase(); if (sub === 'on') { enableWelcome(chatId); await sockInst.sendMessage(chatId, { text: '✅ Welcome system enabled in this group!' }); }
    else if (sub === 'off') { disableWelcome(chatId); await sockInst.sendMessage(chatId, { text: '❌ Welcome system disabled.' }); }
    else if (sub === 'set') { const text = args.slice(1).join(' ').trim(); if (!text) { await sockInst.sendMessage(chatId, { text: `❌ Provide a message.\n\nCorrect format:\n${config.prefix}welcome set Welcome to {group}, @user 👋` }); return; } const v = validateWelcomeTemplate(text); if (!v.valid) { await sockInst.sendMessage(chatId, { text: `❌ ${v.reason}\n\nCorrect format:\n${config.prefix}welcome set Welcome to {group}, @user 👋` }); return; } setWelcomeMessage(chatId, text); await sockInst.sendMessage(chatId, { text: '✅ Custom welcome message saved for this group!' }); }
    else { await sockInst.sendMessage(chatId, { text: `Usage:\n${config.prefix}welcome on\n${config.prefix}welcome off\n${config.prefix}welcome set <message with @user and {group}>` }); }
  });

  registerCommand('revoke', 'Revoke group invite link', async (sockInst, msg) => {
    if (!isGroup(msg.key.remoteJid)) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ This command is only for groups!' }); return; }
    const ownerBypass = isOwnerMsg(msg);
    if (!ownerBypass) {
      const admin = await isUserAdmin(sockInst, msg.key.remoteJid, msg.key.participant);
      if (!admin) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Only admins can use this command!' }); return; }
    }
    try {
      await sockInst.groupRevokeInvite(msg.key.remoteJid);
      await sockInst.sendMessage(msg.key.remoteJid, { text: '✅ Invite link revoked successfully.' });
    } catch (e) {
      await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed to revoke invite: ${e.message}` });
    }
  });

  registerCommand('join', 'Join a group via invite link', async (sockInst, msg, args) => {
    const text = args.join(' ') || msg.message?.extendedTextMessage?.text || '';
    const match = text.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i);
    if (!match) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Invalid or missing invite link.' }); return; }
    const code = match[1];
    try {
      const res = await sockInst.groupAcceptInvite(code);
      await sockInst.sendMessage(msg.key.remoteJid, { text: `✅ Joined or request sent. Group: ${res}` });
    } catch (e) {
      await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed to join: ${e.message}` });
    }
  });

  registerCommand('ginfo', 'Show group invite info from link', async (sockInst, msg, args) => {
    const text = args.join(' ') || msg.message?.extendedTextMessage?.text || '';
    const match = text.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i);
    if (!match) { await sockInst.sendMessage(msg.key.remoteJid, { text: '❌ Provide a valid invite link.' }); return; }
    const code = match[1];
    try {
      if (typeof sockInst.groupGetInviteInfo === 'function') {
        const info = await sockInst.groupGetInviteInfo(code);
        const creator = (info?.creator || '').split('@')[0];
        const details = `📋 Group Info\n\n• Name: ${info?.subject || 'unknown'}\n• ID: ${info?.id || 'unknown'}\n• Creator: ${creator || 'unknown'}\n• Size: ${info?.size || 'unknown'}\n• Created: ${info?.creation || 'unknown'}\n`;
        await sockInst.sendMessage(msg.key.remoteJid, { text: details });
      } else {
        await sockInst.sendMessage(msg.key.remoteJid, { text: 'ℹ️ Invite info not supported by current API version.' });
      }
    } catch (e) {
      await sockInst.sendMessage(msg.key.remoteJid, { text: `❌ Failed to get invite info: ${e.message}` });
    }
  });
};
