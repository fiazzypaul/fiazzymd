const fs = require('fs');
const path = require('path');

const downloadsDir = './downloads';

/**
 * Get disk space information
 */
function getDiskSpace() {
    const { execSync } = require('child_process');
    try {
        // Windows command
        const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
        console.log('💾 Disk Space:\n', output);
    } catch (error) {
        console.error('Failed to get disk space info');
    }
}

/**
 * Clean up downloads directory
 */
function cleanupDownloads() {
    if (!fs.existsSync(downloadsDir)) {
        console.log('✅ Downloads directory does not exist');
        return;
    }

    const files = fs.readdirSync(downloadsDir);

    if (files.length === 0) {
        console.log('✅ Downloads directory is already empty');
        return;
    }

    let totalSize = 0;
    let deletedCount = 0;

    files.forEach(file => {
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
            totalSize += stats.size;
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`🗑️ Deleted: ${file} (${(stats.size / (1024 * 1024)).toFixed(2)}MB)`);
        }
    });

    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`\n✅ Cleanup complete!`);
    console.log(`📊 Deleted ${deletedCount} files`);
    console.log(`💾 Freed up ${totalSizeMB}MB of space`);
}

/**
 * List downloads with sizes
 */
function listDownloads() {
    if (!fs.existsSync(downloadsDir)) {
        console.log('📁 Downloads directory does not exist');
        return;
    }

    const files = fs.readdirSync(downloadsDir);

    if (files.length === 0) {
        console.log('📁 Downloads directory is empty');
        return;
    }

    console.log(`📁 Downloads directory (${files.length} files):\n`);

    let totalSize = 0;
    files.forEach(file => {
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            totalSize += stats.size;
            const age = Math.floor((Date.now() - stats.mtimeMs) / (1000 * 60)); // minutes
            console.log(`  ${file}`);
            console.log(`    📦 Size: ${sizeMB}MB | 🕒 Age: ${age} minutes ago\n`);
        }
    });

    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`💾 Total size: ${totalSizeMB}MB`);
}

/**
 * Delete old files (older than specified minutes)
 */
function deleteOldFiles(olderThanMinutes = 60) {
    if (!fs.existsSync(downloadsDir)) {
        console.log('✅ Downloads directory does not exist');
        return;
    }

    const files = fs.readdirSync(downloadsDir);
    const now = Date.now();
    let deletedCount = 0;
    let freedSpace = 0;

    files.forEach(file => {
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
            const ageMinutes = (now - stats.mtimeMs) / (1000 * 60);

            if (ageMinutes > olderThanMinutes) {
                const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                fs.unlinkSync(filePath);
                deletedCount++;
                freedSpace += stats.size;
                console.log(`🗑️ Deleted: ${file} (${sizeMB}MB, ${Math.floor(ageMinutes)} min old)`);
            }
        }
    });

    if (deletedCount === 0) {
        console.log(`✅ No files older than ${olderThanMinutes} minutes found`);
    } else {
        const freedMB = (freedSpace / (1024 * 1024)).toFixed(2);
        console.log(`\n✅ Deleted ${deletedCount} old files`);
        console.log(`💾 Freed up ${freedMB}MB of space`);
    }
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

console.log('🧹 FiazzyMD Downloads Cleanup Utility\n');

if (command === 'list') {
    listDownloads();
    console.log('\n');
    getDiskSpace();
} else if (command === 'clean') {
    cleanupDownloads();
    console.log('\n');
    getDiskSpace();
} else if (command === 'old') {
    const minutes = parseInt(args[1]) || 60;
    deleteOldFiles(minutes);
    console.log('\n');
    getDiskSpace();
} else {
    console.log('Usage:');
    console.log('  node cleanup-downloads.js list       - List all downloaded files');
    console.log('  node cleanup-downloads.js clean      - Delete all downloaded files');
    console.log('  node cleanup-downloads.js old [min]  - Delete files older than [min] minutes (default: 60)');
    console.log('\nExamples:');
    console.log('  node cleanup-downloads.js list');
    console.log('  node cleanup-downloads.js clean');
    console.log('  node cleanup-downloads.js old 30   (delete files older than 30 minutes)');
}
