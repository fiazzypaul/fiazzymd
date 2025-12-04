/**
 * Word Chain Game (WCG)
 *
 * Players must continue the chain by starting their word with the last letter of the previous word
 * Two-player game where players tag their opponent to challenge them
 */

const activeGames = new Map();

/**
 * Create a new game
 * @param {string} chatId - Chat/Group ID
 * @param {string} player1 - First player JID
 * @param {string} player2 - Second player JID
 * @returns {Object} Game state
 */
function createGame(chatId, player1, player2) {
    const gameId = chatId;

    const game = {
        id: gameId,
        chatId: chatId,
        players: {
            player1: player1,
            player2: player2
        },
        usedWords: new Set(),
        currentWord: null,
        currentTurn: 'player1', // 'player1' or 'player2'
        startTime: Date.now(),
        status: 'playing', // 'playing', 'ended'
        moves: 0
    };

    activeGames.set(gameId, game);
    return game;
}

/**
 * Get game by chat ID
 * @param {string} chatId - Chat/Group ID
 * @returns {Object|null} Game state or null
 */
function getGame(chatId) {
    return activeGames.get(chatId) || null;
}

/**
 * Delete a game
 * @param {string} chatId - Chat/Group ID
 */
function deleteGame(chatId) {
    activeGames.delete(chatId);
}

/**
 * Process a word submission
 * @param {string} chatId - Chat/Group ID
 * @param {string} playerJid - Player submitting the word
 * @param {string} word - The word submitted
 * @returns {Object} Result of the submission
 */
function submitWord(chatId, playerJid, word) {
    const game = getGame(chatId);

    if (!game) {
        return { success: false, message: '❌ No active game. Start a new game with .wcg @user' };
    }

    // Check if it's player's turn
    const currentPlayerJid = game.players[game.currentTurn];
    if (playerJid !== currentPlayerJid) {
        return { success: false, message: '❌ Not your turn!' };
    }

    // Normalize the word (lowercase, trim)
    const normalizedWord = word.toLowerCase().trim();

    // Validation
    if (!normalizedWord || normalizedWord.length < 2) {
        return { success: false, message: '❌ Word must be at least 2 characters long!' };
    }

    // Check if word contains only letters
    if (!/^[a-z]+$/i.test(normalizedWord)) {
        return { success: false, message: '❌ Word must contain only letters!' };
    }

    // Check if word has been used
    if (game.usedWords.has(normalizedWord)) {
        return {
            success: false,
            gameOver: true,
            loser: playerJid,
            winner: game.players[game.currentTurn === 'player1' ? 'player2' : 'player1'],
            message: `❌ Word "${normalizedWord}" has already been used!\n\n@${playerJid.split('@')[0]} loses! 💀`
        };
    }

    // Check if word starts with last letter of previous word
    if (game.currentWord) {
        const lastLetter = game.currentWord.slice(-1).toLowerCase();
        const firstLetter = normalizedWord[0].toLowerCase();

        if (lastLetter !== firstLetter) {
            return {
                success: false,
                gameOver: true,
                loser: playerJid,
                winner: game.players[game.currentTurn === 'player1' ? 'player2' : 'player1'],
                message: `❌ Word must start with "${lastLetter.toUpperCase()}"!\n\n@${playerJid.split('@')[0]} loses! 💀`
            };
        }
    }

    // Valid word submission
    game.usedWords.add(normalizedWord);
    game.currentWord = normalizedWord;
    game.moves++;

    // Switch turns
    game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';

    const nextLetter = normalizedWord.slice(-1).toUpperCase();

    return {
        success: true,
        game,
        word: normalizedWord,
        nextLetter,
        player: playerJid,
        gameOver: false
    };
}

/**
 * Get mentioned user JID from message
 * @param {Object} msg - Message object
 * @returns {string|null} User JID or null
 */
function getMentionedUser(msg) {
    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    return mentions && mentions.length > 0 ? mentions[0] : null;
}

/**
 * Format the game status
 * @param {Object} game - Game state
 * @returns {string} Formatted status
 */
function formatGame(game) {
    let text = '🔗 *WORD CHAIN GAME* 🔗\n\n';

    // Show players
    text += `👤 Player 1: @${game.players.player1.split('@')[0]}\n`;
    text += `👤 Player 2: @${game.players.player2.split('@')[0]}\n\n`;

    // Show current turn and word
    if (game.currentWord) {
        text += `📝 Current word: *${game.currentWord.toUpperCase()}*\n`;
        const nextLetter = game.currentWord.slice(-1).toUpperCase();
        text += `🔤 Next word must start with: *${nextLetter}*\n\n`;
    } else {
        text += `💡 Start the game by typing any word!\n\n`;
    }

    // Show whose turn
    const currentPlayer = game.players[game.currentTurn];
    text += `🔄 Turn: @${currentPlayer.split('@')[0]}\n\n`;

    // Show stats
    text += `💬 Words used: ${game.usedWords.size}\n`;
    text += `🎯 Moves: ${game.moves}\n\n`;

    text += `💡 Reply with a word to play`;

    return text;
}

module.exports = {
    createGame,
    getGame,
    deleteGame,
    submitWord,
    getMentionedUser,
    formatGame,
    activeGames
};
