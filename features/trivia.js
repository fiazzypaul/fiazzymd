const axios = require('axios');

// Store active trivia sessions
const triviaSessions = new Map();

/**
 * Decode HTML entities in trivia questions/answers
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHTML(text) {
    const entities = {
        '&quot;': '"',
        '&#039;': "'",
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&nbsp;': ' ',
        '&ldquo;': '"',
        '&rdquo;': '"',
        '&rsquo;': "'",
        '&lsquo;': "'",
        '&ndash;': '–',
        '&mdash;': '—'
    };

    return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}

/**
 * Fetch a trivia question from Open Trivia Database
 * @param {string} difficulty - easy, medium, or hard (optional)
 * @param {string} category - trivia category ID (optional)
 * @returns {Promise<Object>} Trivia question data
 */
async function fetchTriviaQuestion(difficulty = null, category = null) {
    try {
        let url = 'https://opentdb.com/api.php?amount=1';

        if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty.toLowerCase())) {
            url += `&difficulty=${difficulty.toLowerCase()}`;
        }

        if (category) {
            url += `&category=${category}`;
        }

        const response = await axios.get(url, { timeout: 10000 });

        if (response.data.response_code !== 0) {
            throw new Error('No trivia questions available');
        }

        const question = response.data.results[0];

        // Decode HTML entities
        question.question = decodeHTML(question.question);
        question.correct_answer = decodeHTML(question.correct_answer);
        question.incorrect_answers = question.incorrect_answers.map(ans => decodeHTML(ans));

        return question;
    } catch (error) {
        console.error('Error fetching trivia:', error);
        throw new Error('Failed to fetch trivia question');
    }
}

/**
 * Start a trivia session for a chat
 * @param {string} chatId - Chat ID
 * @param {string} difficulty - Difficulty level (optional)
 * @returns {Promise<Object>} Formatted trivia question
 */
async function startTrivia(chatId, difficulty = null) {
    try {
        const question = await fetchTriviaQuestion(difficulty);

        // Shuffle answers for multiple choice
        let answers = [...question.incorrect_answers, question.correct_answer];
        answers = answers.sort(() => Math.random() - 0.5);

        // Find correct answer index
        const correctIndex = answers.indexOf(question.correct_answer);

        // Store session
        triviaSessions.set(chatId, {
            question: question.question,
            correctAnswer: question.correct_answer,
            correctIndex: correctIndex,
            answers: answers,
            category: question.category,
            difficulty: question.difficulty,
            type: question.type,
            startTime: Date.now(),
            answered: false
        });

        // Auto-expire after 60 seconds
        setTimeout(() => {
            const session = triviaSessions.get(chatId);
            if (session && !session.answered) {
                session.expired = true;
            }
        }, 60000);

        return formatTriviaQuestion(chatId);
    } catch (error) {
        throw error;
    }
}

/**
 * Format trivia question for display
 * @param {string} chatId - Chat ID
 * @returns {string} Formatted question message
 */
function formatTriviaQuestion(chatId) {
    const session = triviaSessions.get(chatId);
    if (!session) return null;

    const difficultyEmoji = {
        'easy': '🟢',
        'medium': '🟡',
        'hard': '🔴'
    };

    let message = `🎯 *TRIVIA CHALLENGE*\n\n`;
    message += `📚 Category: ${session.category}\n`;
    message += `${difficultyEmoji[session.difficulty] || '⚪'} Difficulty: ${session.difficulty.toUpperCase()}\n\n`;
    message += `❓ *Question:*\n${session.question}\n\n`;

    if (session.type === 'boolean') {
        message += `*Reply with:*\n`;
        message += `1️⃣ True\n`;
        message += `2️⃣ False\n\n`;
    } else {
        message += `*Choose your answer:*\n`;
        session.answers.forEach((answer, index) => {
            message += `${index + 1}️⃣ ${answer}\n`;
        });
        message += `\n`;
    }

    message += `⏱️ You have 60 seconds to answer!`;

    return message;
}

/**
 * Check user's answer
 * @param {string} chatId - Chat ID
 * @param {string} answer - User's answer (number or text)
 * @returns {Object} Result object with correct, message, and points
 */
function checkAnswer(chatId, answer) {
    const session = triviaSessions.get(chatId);

    if (!session) {
        return {
            correct: false,
            message: '❌ No active trivia session!\n\nUse `.trivia` to start a new game.',
            points: 0
        };
    }

    if (session.answered) {
        return {
            correct: false,
            message: '⚠️ You already answered this question!\n\nUse `.trivia` to start a new game.',
            points: 0
        };
    }

    if (session.expired) {
        triviaSessions.delete(chatId);
        return {
            correct: false,
            message: `⏰ *Time's Up!*\n\n` +
                    `The correct answer was:\n✅ ${session.correctAnswer}\n\n` +
                    `Better luck next time!`,
            points: 0
        };
    }

    // Mark as answered
    session.answered = true;

    // Check if answer is correct
    const userAnswer = answer.trim();
    let isCorrect = false;

    // Check by number
    const answerNum = parseInt(userAnswer);
    if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= session.answers.length) {
        isCorrect = (answerNum - 1) === session.correctIndex;
    } else {
        // Check by text (case-insensitive)
        isCorrect = userAnswer.toLowerCase() === session.correctAnswer.toLowerCase();
    }

    // Calculate points based on difficulty and time
    const timeTaken = Date.now() - session.startTime;
    let points = 0;

    if (isCorrect) {
        const basePoints = {
            'easy': 10,
            'medium': 20,
            'hard': 30
        };

        points = basePoints[session.difficulty] || 10;

        // Bonus for quick answers (under 10 seconds)
        if (timeTaken < 10000) {
            points += 5;
        }
    }

    // Clean up session
    triviaSessions.delete(chatId);

    if (isCorrect) {
        return {
            correct: true,
            message: `🎉 *CORRECT!*\n\n` +
                    `✅ ${session.correctAnswer}\n\n` +
                    `⭐ +${points} points\n` +
                    `⏱️ Time: ${(timeTaken / 1000).toFixed(1)}s\n\n` +
                    `Great job! Use \`.trivia\` to play again!`,
            points: points
        };
    } else {
        return {
            correct: false,
            message: `❌ *INCORRECT!*\n\n` +
                    `The correct answer was:\n✅ ${session.correctAnswer}\n\n` +
                    `Better luck next time! Use \`.trivia\` to try again!`,
            points: 0
        };
    }
}

/**
 * Get active trivia session
 * @param {string} chatId - Chat ID
 * @returns {Object|null} Session object or null
 */
function getSession(chatId) {
    return triviaSessions.get(chatId) || null;
}

/**
 * Get trivia categories
 * @returns {string} List of available categories
 */
function getCategories() {
    return `📚 *TRIVIA CATEGORIES*\n\n` +
           `Use: \`.trivia [difficulty]\`\n\n` +
           `*Difficulty Levels:*\n` +
           `🟢 easy - Simple questions\n` +
           `🟡 medium - Moderate challenge\n` +
           `🔴 hard - Expert level\n\n` +
           `*Examples:*\n` +
           `\`.trivia\` - Random difficulty\n` +
           `\`.trivia easy\` - Easy questions\n` +
           `\`.trivia hard\` - Hard questions\n\n` +
           `Questions from various categories:\n` +
           `• General Knowledge\n` +
           `• Science & Nature\n` +
           `• History\n` +
           `• Geography\n` +
           `• Entertainment\n` +
           `• Sports\n` +
           `• And more!`;
}

module.exports = {
    startTrivia,
    checkAnswer,
    getSession,
    getCategories
};
