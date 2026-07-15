import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createReleaseConfiguration, safeReleaseSummary } from './release-policy.mjs';

const require = createRequire(import.meta.url);
const { build, Platform } = require('electron-builder');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${path.basename(command)} exited with ${result.status}`);
}

const release = createReleaseConfiguration(process.env, packageJson);
console.log('[release] preflight');
console.log(JSON.stringify(safeReleaseSummary(release), null, 2));

if (process.argv.includes('--preflight')) process.exit(0);
if (process.platform !== 'win32') throw new Error('signed Windows releases must be built on Windows');

run(process.execPath, [path.join(root, 'scripts', 'gen_state_manifest.mjs'), '--check']);

const config = structuredClone(packageJson.build || {});
config.publish = [release.publish];
config.extraMetadata = {
    ...(config.extraMetadata || {}),
    releaseChannel: release.channel,
};
config.win = {
    ...(config.win || {}),
    forceCodeSigning: true,
    verifyUpdateCodeSignature: true,
    electronUpdaterCompatibility: '>=2.16',
};
if (release.signing.mode === 'store') {
    config.win.signtoolOptions = {
        ...(config.win.signtoolOptions || {}),
        certificateSubjectName: release.signing.certificateSubjectName,
    };
}
if (release.signing.mode === 'azure') {
    delete config.win.signtoolOptions;
    config.win.azureSignOptions = release.signing.azure;
}

const artifacts = await build({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget(),
    config,
    publish: 'never',
});
const executables = artifacts.filter((file) => path.extname(file).toLowerCase() === '.exe');
if (executables.length < 2) throw new Error('release build did not produce both installer and portable executables');

const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const signatureArguments = ['-NoProfile', '-NonInteractive', '-File', path.join(scriptDir, 'verify-signatures.ps1')];
if (release.signing.allowSelfSigned) signatureArguments.push('-AllowSelfSigned');
signatureArguments.push(...executables);
run(powershell, signatureArguments);

const dist = path.join(root, config.directories?.output || 'dist');
const files = await readdir(dist, { withFileTypes: true });
const metadataName = release.channel === 'stable' ? 'latest.yml' : 'beta.yml';
if (!files.some((entry) => entry.isFile() && entry.name === metadataName)) {
    throw new Error(`release build did not produce ${metadataName}`);
}

const releaseFiles = files
    .filter((entry) => entry.isFile() && (/\.exe(?:\.blockmap)?$/i.test(entry.name) || entry.name === metadataName))
    .map((entry) => entry.name)
    .sort();
const checksums = [];
for (const name of releaseFiles) {
    const content = await readFile(path.join(dist, name));
    checksums.push(`${createHash('sha256').update(content).digest('hex')}  ${name}`);
}
await writeFile(path.join(dist, 'release-checksums.sha256'), `${checksums.join('\n')}\n`, 'utf8');

console.log(`[release] ready: ${releaseFiles.length} artifacts + checksums`);
