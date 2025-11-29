const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

function formatUptime(seconds) {
  function pad(s) { return (s < 10 ? '0' : '') + s; }
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (days === 0 && hours === 0) {
    return `${pad(minutes)} Minutes, ${pad(secs)} Seconds`;
  }
  const parts = [];
  if (days > 0) parts.push(`${days} Days`);
  parts.push(`${pad(hours)} Hours`);
  parts.push(`${pad(minutes)} Minutes`);
  parts.push(`${pad(secs)} Seconds`);
  return parts.join(', ');
}

function getUptime() {
  return formatUptime(process.uptime());
}

function restartBot() {
  process.exit(0);
}

function isManagedByPM2() {
  return !!process.env.pm_id;
}

async function ensureOrigin() {
  try {
    const { stdout } = await execPromise('git remote get-url origin');
    const url = stdout.trim();
    if (url !== 'https://github.com/fiazzypaul/fiazzymd.git') {
      await execPromise('git remote set-url origin https://github.com/fiazzypaul/fiazzymd.git');
    }
  } catch {
    await execPromise('git remote add origin https://github.com/fiazzypaul/fiazzymd.git');
  }
}

async function updateAndRestart() {
  try {
    await ensureOrigin();
    const { stdout: pullOut, stderr: pullErr } = await execPromise('git pull');
    if (pullErr && !pullErr.includes('Already up to date.')) {
      return { success: false, message: `❌ Failed to update. Git Pull Error:\n${pullErr}` };
    }
    if ((pullOut || '').includes('Already up to date.') || (pullErr || '').includes('Already up to date.')) {
      return { success: true, message: '✅ Bot files are already up to date.' };
    }
    await execPromise('npm install');
    restartBot();
    return { success: true, message: '✅ Successfully updated and restarting...' };
  } catch (e) {
    return { success: false, message: `❌ Update error: ${e.message}` };
  }
}

async function checkForUpdates() {
  try {
    await ensureOrigin();
    await execPromise('git fetch');
    const { stdout: local } = await execPromise('git rev-parse HEAD');
    const { stdout: remote } = await execPromise('git rev-parse origin/HEAD');
    const remoteCommit = remote.trim();
    const localCommit = local.trim();

    if (localCommit !== remoteCommit) {
      const { stdout: ahead } = await execPromise('git rev-list --left-right --count HEAD...origin/HEAD');
      const parts = ahead.trim().split('\t');
      const behind = parseInt(parts[1] || '0', 10);
      return {
        hasUpdates: true,
        aheadBy: behind,
        remoteCommit: remoteCommit,
        message: `📦 Updates available: ${behind} commit${behind > 1 ? 's' : ''}. Run .update`
      };
    }
    return { hasUpdates: false, aheadBy: 0, remoteCommit: remoteCommit, message: 'Up to date' };
  } catch (e) {
    return { hasUpdates: false, aheadBy: 0, remoteCommit: null, message: `Update check failed: ${e.message}` };
  }
}

module.exports = { getUptime, restartBot, updateAndRestart, checkForUpdates, isManagedByPM2 };