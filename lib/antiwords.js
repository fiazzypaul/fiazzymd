const fs = require('fs');
const path = require('path');

// Storage file path
const STORAGE_FILE = path.join(__dirname, '..', 'data', 'antiwords.json');

// Ensure data directory exists
function ensureDataDir() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

// Load antiwords data from file
function loadAntiwords() {
    try {
        ensureDataDir();
        if (fs.existsSync(STORAGE_FILE)) {
            const data = fs.readFileSync(STORAGE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading antiwords data:', error);
    }
    return {};
}

// Save antiwords data to file
function saveAntiwords(data) {
    try {
        ensureDataDir();
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving antiwords data:', error);
        return false;
    }
}

// Get antiword settings for a group
function getWord(groupJid, messageId) {
    const data = loadAntiwords();
    return data[groupJid] || null;
}

// Set antiword status (on/off) for a group
function setWord(groupJid, status, messageId) {
    const data = loadAntiwords();
    if (!data[groupJid]) {
        data[groupJid] = {
            enabled: false,
            action: 'null',
            words: ''
        };
    }
    
    if (typeof status === 'boolean') {
        data[groupJid].enabled = status;
    } else if (['kick', 'warn', 'null'].includes(status)) {
        data[groupJid].action = status;
    } else if (status === '') {
        data[groupJid].words = '';
    }
    
    saveAntiwords(data);
    return data[groupJid];
}

// Add a word to the antiword list
function addWord(groupJid, word, messageId) {
    const data = loadAntiwords();
    if (!data[groupJid]) {
        data[groupJid] = {
            enabled: false,
            action: 'null',
            words: ''
        };
    }
    
    const currentWords = data[groupJid].words ? data[groupJid].words.split(',') : [];
    const newWords = word.split(',').map(w => w.trim()).filter(w => w);
    
    // Add new words avoiding duplicates
    for (const newWord of newWords) {
        if (!currentWords.includes(newWord)) {
            currentWords.push(newWord);
        }
    }
    
    data[groupJid].words = currentWords.join(',');
    saveAntiwords(data);
    return data[groupJid];
}

// Remove a word from the antiword list
function removeWord(groupJid, word, messageId) {
    const data = loadAntiwords();
    if (!data[groupJid] || !data[groupJid].words) {
        return null;
    }
    
    const currentWords = data[groupJid].words.split(',');
    const wordsToRemove = word.split(',').map(w => w.trim()).filter(w => w);
    
    // Remove specified words
    const filteredWords = currentWords.filter(w => !wordsToRemove.includes(w.trim()));
    
    data[groupJid].words = filteredWords.join(',');
    saveAntiwords(data);
    return data[groupJid];
}

// Check if a message contains antiwords
function checkAntiwords(groupJid, messageText) {
    const settings = getWord(groupJid);
    if (!settings || !settings.enabled || !settings.words) {
        return { found: false, words: [] };
    }
    
    const words = settings.words.split(',').map(w => w.trim().toLowerCase()).filter(w => w);
    const foundWords = [];
    
    for (const word of words) {
        if (messageText.toLowerCase().includes(word)) {
            foundWords.push(word);
        }
    }
    
    return {
        found: foundWords.length > 0,
        words: foundWords,
        action: settings.action
    };
}

module.exports = {
    getWord,
    setWord,
    addWord,
    removeWord,
    checkAntiwords
};