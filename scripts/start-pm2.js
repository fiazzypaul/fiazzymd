const { exec, spawn } = require('child_process');
const util = require('util');
const path = require('path');
const execPromise = util.promisify(exec);

async function hasPM2() {
  try {
    await execPromise('pm2 -v');
    return true;
  } catch {
    return false;
  }
}

async function startWithPM2() {
  const ecoPath = path.join(process.cwd(), 'ecosystem.config.js');
  try {
    await execPromise(`pm2 start "${ecoPath}" --env production`);
  } catch (e) {
    try {
      await execPromise('pm2 restart FiazzyMD');
    } catch (e2) {
      throw e2;
    }
  }
  try { await execPromise('pm2 save'); } catch {}
}

async function main() {
  console.log('🔧 Ensuring PM2 is available...');
  if (!(await hasPM2())) {
    console.error('❌ PM2 is not installed. Install it with: npm i -g pm2');
    process.exit(1);
  }

  console.log('🚀 Starting FiazzyMD with PM2 (env=production)...');
  await startWithPM2();

  console.log('📜 Streaming logs (Ctrl+C to detach logs, app keeps running under PM2)');
  const child = spawn('pm2', ['logs', 'FiazzyMD'], { stdio: 'inherit', shell: true });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error('❌ Failed to start via PM2:', e.message);
  process.exit(1);
});