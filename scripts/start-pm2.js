const pm2 = require('pm2');
const { spawn } = require('child_process');

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

function start() {
  console.log('🔧 Ensuring PM2 is available...');
  pm2.connect((err) => {
    if (err) {
      console.error('❌ PM2 connect error:', err.message);
      process.exit(1);
    }
    console.log('🚀 Starting FiazzyMD with PM2 (env=production)...');
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
        pm2.restart('FiazzyMD', onStarted);
      } else {
        pm2.start({
          name: 'FiazzyMD',
          script: 'index.js',
          exec_mode: 'fork',
          instances: 1,
          env: { NODE_ENV: 'production' }
        }, onStarted);
      }
    });
  });
}

start();