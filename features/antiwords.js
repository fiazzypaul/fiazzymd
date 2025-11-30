/**
 * Antiwords command - Filter and manage banned words in groups
 * Automatically detects and takes action on messages containing banned words
 */

module.exports = function registerAntiwordsCommand({ registerCommand }) {
    const { getWord, setWord, addWord, removeWord, lang } = require('../lib');
    const config = {
        prefix: process.env.PREFIX || '.'
    };

    registerCommand('antiword', 'Manage antiword filter in groups', async (sock, msg, args) => {
        const groupJid = msg.key.remoteJid;
        
        // Only allow in groups
        if (!groupJid.includes('@g.us')) {
            await sock.sendMessage(groupJid, {
                text: '❌ This command can only be used in groups!'
            });
            return;
        }

        const match = args.join(' ');
        const antiword = await getWord(groupJid, msg.key.id);
        const status = antiword && antiword.enabled ? 'on' : 'off';
        const action = antiword && antiword.action ? antiword.action : 'null';
        const words = antiword && antiword.words ? antiword.words : '';

        if (!match) {
            return await sock.sendMessage(groupJid, {
                text: lang.plugins.antiword.example(status)
            });
        }

        const cmd = match.split(' ')[0].toLowerCase();
        const args_text = match.slice(cmd.length).trim();

        if (cmd === 'on' || cmd === 'off') {
            await setWord(groupJid, cmd === 'on', msg.key.id);
            return await sock.sendMessage(groupJid, {
                text: lang.plugins.antiword.status(cmd === 'on' ? 'activated' : 'deactivated')
            });
        }

        if (['kick', 'warn', 'null'].includes(cmd)) {
            await setWord(groupJid, cmd, msg.key.id);
            return await sock.sendMessage(groupJid, {
                text: lang.plugins.antiword.action_update(cmd)
            });
        }

        if (cmd === 'add') {
            if (!args_text) {
                return await sock.sendMessage(groupJid, {
                    text: lang.plugins.antiword.add_prompt
                });
            }
            await addWord(groupJid, args_text, msg.key.id);
            return await sock.sendMessage(groupJid, {
                text: lang.plugins.antiword.added(args_text)
            });
        }

        if (cmd === 'remove') {
            if (!args_text) {
                return await sock.sendMessage(groupJid, {
                    text: lang.plugins.antiword.remove_prompt
                });
            }
            await removeWord(groupJid, args_text, msg.key.id);
            return await sock.sendMessage(groupJid, {
                text: lang.plugins.antiword.removed(args_text)
            });
        }

        if (cmd === 'list' || cmd === 'info') {
            if (!words) {
                return await sock.sendMessage(groupJid, {
                    text: lang.plugins.antiword.no_words
                });
            }
            return await sock.sendMessage(groupJid, {
                text: lang.plugins.antiword.info(status, action, words.replace(/,/g, ', '))
            });
        }

        if (cmd === 'clear') {
            await setWord(groupJid, '', msg.key.id);
            if (words) {
                await removeWord(groupJid, words, msg.key.id);
            }
            return await sock.sendMessage(groupJid, {
                text: lang.plugins.antiword.cleared
            });
        }

        return await sock.sendMessage(groupJid, {
            text: lang.plugins.antiword.example(status)
        });
    });

    // Function to check messages for antiwords (to be integrated into message handling)
    async function handleAntiwordsCheck(sock, msg) {
        const groupJid = msg.key.remoteJid;
        
        // Only check in groups
        if (!groupJid.includes('@g.us')) {
            return;
        }

        // Get message text
        let messageText = '';
        const m = msg.message;
        
        if (m.extendedTextMessage) {
            messageText = m.extendedTextMessage.text || '';
        } else if (m.conversation) {
            messageText = m.conversation;
        }

        if (!messageText) {
            return;
        }

        // Check for antiwords
        const { checkAntiwords } = require('../lib');
        const result = checkAntiwords(groupJid, messageText);

        if (result.found) {
            console.log(`Antiword detected in ${groupJid}: ${result.words.join(', ')}`);
            
            // Take action based on settings
            switch (result.action) {
                case 'kick':
                    try {
                        await sock.groupParticipantsUpdate(
                            groupJid,
                            [msg.key.participant || msg.key.remoteJid],
                            'remove'
                        );
                        await sock.sendMessage(groupJid, {
                            text: `⚠️ User removed for using forbidden words: ${result.words.join(', ')}`
                        });
                    } catch (error) {
                        console.error('Failed to kick user:', error);
                        await sock.sendMessage(groupJid, {
                            text: `⚠️ Forbidden words detected: ${result.words.join(', ')}`
                        });
                    }
                    break;
                    
                case 'warn':
                    await sock.sendMessage(groupJid, {
                        text: `⚠️ Warning: Forbidden words detected: ${result.words.join(', ')}\n\nPlease follow the group rules.`
                    });
                    break;
                    
                default:
                    // Just delete the message if possible (null action)
                    try {
                        await sock.sendMessage(groupJid, {
                            delete: msg.key
                        });
                    } catch (error) {
                        console.error('Failed to delete message:', error);
                    }
                    break;
            }
        }
    }

    // Export the handler function for integration
    module.exports.handleAntiwordsCheck = handleAntiwordsCheck;
};
