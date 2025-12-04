/**
 * Tic-Tac-Toe Game for WhatsApp
 * Players can challenge each other to play tic-tac-toe
 */

// Store active games: Map<gameId, gameState>
const activeGames = new Map();

/**
 * Create a new game or get existing game
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
            X: player1,
            O: player2
        },
        board: [
            [' ', ' ', ' '],
            [' ', ' ', ' '],
            [' ', ' ', ' ']
        ],
        currentTurn: 'X',
        status: 'playing', // 'playing', 'won', 'draw'
        winner: null,
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
 * Make a move in the game
 * @param {string} chatId - Chat/Group ID
 * @param {string} playerJid - Player making the move
 * @param {number} position - Position (1-9)
 * @returns {Object} Result of the move
 */
function makeMove(chatId, playerJid, position) {
    const game = getGame(chatId);

    if (!game) {
        return { success: false, message: '❌ No active game. Start a new game with .ttt @user' };
    }

    // Check if it's player's turn
    const currentPlayerJid = game.players[game.currentTurn];
    if (playerJid !== currentPlayerJid) {
        return { success: false, message: '❌ Not your turn!' };
    }

    // Convert position (1-9) to row/col
    if (position < 1 || position > 9) {
        return { success: false, message: '❌ Position must be between 1-9' };
    }

    const row = Math.floor((position - 1) / 3);
    const col = (position - 1) % 3;

    // Check if position is already taken
    if (game.board[row][col] !== ' ') {
        return { success: false, message: '❌ Position already taken!' };
    }

    // Make the move
    game.board[row][col] = game.currentTurn;
    game.moves++;

    // Check for winner
    const winner = checkWinner(game.board);
    if (winner) {
        game.status = 'won';
        game.winner = game.players[winner];
        return { success: true, game, gameOver: true, result: 'win' };
    }

    // Check for draw
    if (game.moves === 9) {
        game.status = 'draw';
        return { success: true, game, gameOver: true, result: 'draw' };
    }

    // Switch turns
    game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';

    return { success: true, game, gameOver: false };
}

/**
 * Check if there's a winner
 * @param {Array} board - Game board
 * @returns {string|null} 'X', 'O', or null
 */
function checkWinner(board) {
    // Check rows
    for (let i = 0; i < 3; i++) {
        if (board[i][0] !== ' ' && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
            return board[i][0];
        }
    }

    // Check columns
    for (let i = 0; i < 3; i++) {
        if (board[0][i] !== ' ' && board[0][i] === board[1][i] && board[1][i] === board[2][i]) {
            return board[0][i];
        }
    }

    // Check diagonals
    if (board[0][0] !== ' ' && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
        return board[0][0];
    }
    if (board[0][2] !== ' ' && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
        return board[0][2];
    }

    return null;
}

/**
 * Format the game board for display
 * @param {Object} game - Game state
 * @returns {string} Formatted board
 */
function formatBoard(game) {
    const board = game.board;
    let text = '🎮 *TIC-TAC-TOE* 🎮\n\n';

    // Show players
    text += `❌ Player X: @${game.players.X.split('@')[0]}\n`;
    text += `⭕ Player O: @${game.players.O.split('@')[0]}\n\n`;

    // Show current turn
    if (game.status === 'playing') {
        text += `🔄 Turn: ${game.currentTurn === 'X' ? '❌' : '⭕'} @${game.players[game.currentTurn].split('@')[0]}\n\n`;
    }

    // Draw the board
    text += '```\n';
    text += '     │     │     \n';
    text += `  ${formatCell(board[0][0], 1)}  │  ${formatCell(board[0][1], 2)}  │  ${formatCell(board[0][2], 3)}  \n`;
    text += '     │     │     \n';
    text += '─────┼─────┼─────\n';
    text += '     │     │     \n';
    text += `  ${formatCell(board[1][0], 4)}  │  ${formatCell(board[1][1], 5)}  │  ${formatCell(board[1][2], 6)}  \n`;
    text += '     │     │     \n';
    text += '─────┼─────┼─────\n';
    text += '     │     │     \n';
    text += `  ${formatCell(board[2][0], 7)}  │  ${formatCell(board[2][1], 8)}  │  ${formatCell(board[2][2], 9)}  \n`;
    text += '     │     │     \n';
    text += '```\n';

    // Show game status
    if (game.status === 'won') {
        text += `\n🎉 *WINNER!* 🎉\n`;
        text += `@${game.winner.split('@')[0]} wins!\n`;
    } else if (game.status === 'draw') {
        text += `\n🤝 *DRAW!* 🤝\n`;
        text += `Game ended in a tie!\n`;
    } else {
        text += `\n💡 Reply with a number (1-9) to make your move\n`;
    }

    return text;
}

/**
 * Format a cell for display
 * @param {string} value - Cell value ('X', 'O', or ' ')
 * @param {number} position - Position number (1-9)
 * @returns {string} Formatted cell
 */
function formatCell(value, position) {
    if (value === 'X') return 'X';
    if (value === 'O') return 'O';
    return position.toString();
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

module.exports = {
    createGame,
    getGame,
    deleteGame,
    makeMove,
    formatBoard,
    getMentionedUser,
    activeGames
};
