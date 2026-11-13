'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn, spawnSync} = require('node:child_process');
async function main() {
  if (process.platform !== 'win32') throw new Error('Native capture smoke tests require Windows.');
  if (!process.env.GALSHELF_HOOK_ROOT) throw new Error('Set GALSHELF_HOOK_ROOT to a local compatible LunaHook directory.');
  const root = path.resolve(__dirname, '..');
  const build = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'build-capture.ps1')], {stdio: 'inherit', windowsHide: true});
  if (build.status !== 0) throw new Error('Could not build capture helpers.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'galshelf-capture-smoke-'));
  const compiler = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  for (const [bit, platform] of [['32', 'x86'], ['64', 'x64']]) {
    const result = spawnSync(compiler, ['/nologo', '/target:winexe', '/platform:' + platform, '/codepage:65001', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/out:' + path.join(dir, 'CaptureFixture' + bit + '.exe'), path.join(root, 'test', 'CaptureFixture.cs')], {stdio: 'inherit', windowsHide: true});
    if (result.status !== 0) throw new Error('Could not compile synthetic dialogue fixture.');
  }
  const env = {...process.env, GALSHELF_DATA_DIR: path.join(dir, 'data'), GALSHELF_CAPTURE_FIXTURES: dir};
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [root, '--capture-smoke-test'], {env, stdio: 'inherit', windowsHide: true});
  const timeout = setTimeout(() => child.kill(), 150000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  clearTimeout(timeout);
  const report = path.join(dir, 'data', 'capture-smoke-result.json');
  if (!fs.existsSync(report)) throw new Error('Capture test produced no report. Diagnostics: ' + dir);
  const result = JSON.parse(fs.readFileSync(report, 'utf8'));
  if (code !== 0 || !result.ok) throw new Error((result.error || 'Capture smoke failed') + '\nDiagnostics: ' + dir);
  if (result.remainingPid) {
    process.kill(result.remainingPid, 0); // App quit must not kill its game.
    fs.writeFileSync(result.stopFile, 'exit');
    const end = Date.now() + 8000;
    let alive = true;
    while (alive && Date.now() < end) {
      await new Promise(resolve => setTimeout(resolve, 200));
      try { process.kill(result.remainingPid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
    }
    if (alive) throw new Error('Synthetic game failed to exit after the app-quit test. Diagnostics: ' + dir);
  }
  console.log('Capture smoke passed. Diagnostics: ' + dir);
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
