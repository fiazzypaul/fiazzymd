const createPermissions = require('./permissions');
const config = { ownerNumber: '1234567890' };
const Permissions = createPermissions(config);

try {
  const registerGroupCommands = require('./features/group');
  console.log('✅ Group module loaded successfully');

  // Test registration
  const commands = new Map();
  const registerCommand = (name, desc, handler) => {
    commands.set(name, { name, desc, handler });
    console.log(`Registered command: ${name}`);
  };

  // Mock sock object with required methods
  const mockSock = {
    sendMessage: async () => {},
    groupMetadata: async () => ({ participants: [] }),
    groupInviteCode: async () => 'test-code',
    groupParticipantsUpdate: async () => [{ status: '200' }],
    groupSettingUpdate: async () => {},
    groupAcceptInvite: async () => 'test-group',
    groupRevokeInvite: async () => {},
    user: { id: 'test@s.whatsapp.net' }
  };

  registerGroupCommands({
    sock: mockSock,
    config,
    Permissions,
    registerCommand,
    muteTimers: new Map(),
    warnLimits: new Map(),
    warnCounts: new Map(),
    antiLinkSettings: new Map()
  });

  console.log(`✅ Successfully registered ${commands.size} commands`);
  console.log('Available commands:', Array.from(commands.keys()));
  
  // Test that commands are properly stored
  const inviteCmd = commands.get('invite');
  if (inviteCmd) {
    console.log('✅ Invite command found and ready to use');
  } else {
    console.log('❌ Invite command not found');
  }
  
} catch(e) {
  console.error('❌ Error:', e.message);
  console.error(e.stack);
}