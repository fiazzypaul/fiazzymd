const pm2 = require('pm2');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function streamLogsViaBus() {
  pm2.launchBus((busErr, bus) => {
    if (busErr) {
      const child = spawn('npx', ['pm2', 'logs', 'FiazzyMD'], { stdio: 'inherit', shell: true });
      child.on('exit', (code) => process.exit(code ?? 0));
      return;
    }
    console.log('📜 Streaming logs');
    bus.on('log:out', (packet) => {
      if (packet.process.name === 'FiazzyMD') process.stdout.write(packet.data);
    });
    bus.on('log:err', (packet) => {
      if (packet.process.name === 'FiazzyMD') process.stderr.write(packet.data);
    });
  });
}

async function getSetupEnv() {
  const sessionsDir = path.join(process.cwd(), 'sessions');
  try { if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir); } catch {}
  const existing = fs.readdirSync(sessionsDir)
    .filter(d => {
      const p = path.join(sessionsDir, d);
      try { return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'creds.json')); } catch { return false; }
    });
  if (existing.length > 0) {
    return { SESSION_NAME: existing[0], AUTH_METHOD: 'qr' };
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));
  const sessionName = (await ask('Enter session name (default: session1): ')) || 'session1';
  let methodChoice = (await ask('Choose connection method (1=QR, 2=Pairing): ')).trim();
  let method = methodChoice === '2' ? 'pair' : 'qr';
  let phone = '';
  if (method === 'pair') {
    phone = (await ask('Enter phone number (country code, digits only): ')).replace(/[^0-9]/g, '');
    if (!phone || phone.length < 10) {
      console.log('❌ Invalid phone number. Falling back to QR.\n');
      method = 'qr';
      phone = '';
    }
  }
  rl.close();
  return { SESSION_NAME: sessionName, AUTH_METHOD: method, PAIR_NUMBER: phone };
}

function start() {
  console.log('🔧 Ensuring PM2 is available...');
  pm2.connect((err) => {
    if (err) {
      console.error('❌ PM2 connect error:', err.message);
      process.exit(1);
    }
    console.log('🚀 Starting FiazzyMD with PM2 (env=production)...');
    getSetupEnv().then((envSetup) => {
    pm2.list((listErr, list) => {
      if (listErr) {
        console.error('❌ PM2 list error:', listErr.message);
        pm2.disconnect();
        process.exit(1);
      }
      const exists = Array.isArray(list) && list.some((p) => p.name === 'FiazzyMD');
      const onStarted = (errStart) => {
        if (errStart) {
          console.error('❌ PM2 start/restart error:', errStart.message);
          pm2.disconnect();
          process.exit(1);
        }
        pm2.dump(() => {
          streamLogsViaBus();
        });
      };
      if (exists) {
        // Delete existing process and restart with new env
        pm2.delete('FiazzyMD', (delErr) => {
          if (delErr) {
            console.error('❌ PM2 delete error:', delErr.message);
            pm2.disconnect();
            process.exit(1);
          }
          // Start fresh with new environment variables
          pm2.start({
            name: 'FiazzyMD',
            script: 'index.js',
            exec_mode: 'fork',
            instances: 1,
            env: { NODE_ENV: 'production', ...envSetup }
          }, onStarted);
        });
      } else {
        pm2.start({
          name: 'FiazzyMD',
          script: 'index.js',
          exec_mode: 'fork',
          instances: 1,
          env: { NODE_ENV: 'production', ...envSetup }
        }, onStarted);
      }
    });
    }).catch((e) => {
      console.error('❌ Setup failed:', e.message);
      pm2.disconnect();
      process.exit(1);
    });
  });
}

start();