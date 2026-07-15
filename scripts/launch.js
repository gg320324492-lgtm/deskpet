/**
 * launch.js
 * 在 Windows 上，某些环境下设置了 ELECTRON_RUN_AS_NODE=1
 * （例如某些 IDE 或终端会话），这会让 Electron 以 Node.js 模式启动，
 * 导致 `require('electron')` 返回二进制路径字符串而非 API 对象。
 *
 * 此脚本作为 npm 启动入口，强制取消该环境变量后再 spawn electron。
 */
const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');           // 返回 electron.exe 路径（字符串）
const args = [path.join(__dirname, '..'), ...process.argv.slice(2)];

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;                   // 关键：取消 Node 模式

console.log('[launch] electron:', electronPath);
console.log('[launch] cwd:', process.cwd());
console.log('[launch] args:', args.slice(1));

const child = spawn(electronPath, args, {
    stdio: 'inherit',
    env,
    windowsHide: false,
});

child.on('close', (code, signal) => {
    if (code != null) process.exit(code);
    if (signal) {
        console.error(`[launch] electron exited with signal ${signal}`);
        process.exit(1);
    }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => child.kill(sig));
}