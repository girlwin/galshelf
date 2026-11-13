'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const {CaptureController, nativePath, runtimeDirectory} = require('../lib/capture');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'galshelf-capture-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  for (const name of ['LunaHost64.dll', 'LunaHook32.dll', 'LunaHook64.dll', 'novel.exe', 'other.exe']) fs.writeFileSync(path.join(dir, name), 'synthetic');
  const game = {id: 'novel', title: '测试视觉小说', exePath: path.join(dir, 'novel.exe')};
  const target = {pid: 4233, hwnd: '34567', name: 'novel', started: '639299171384739806', path: game.exePath, title: 'test'};
  const children = []; let targets = [], listOverride;
  const c = new CaptureController({interval: 60000, stopTimeout: 100,
    run: async (_file, args) => args[0] === '--probe' ? {stdout: '{"type":"probe","available":true}'} : listOverride ? listOverride() : {stdout: JSON.stringify({type: 'targets', targets})},
    spawn: (_file, args, options) => {
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.commands = []; child.args = args; child.options = options;
      child.stdin.on('data', data => { const command = JSON.parse(String(data)); child.commands.push(command); if (command.type === 'quit') queueMicrotask(() => child.emit('close', 0)); });
      child.kill = () => { child.killed = true; child.emit('close', 1); };
      child.output = event => child.stdout.write(JSON.stringify(event) + '\n'); children.push(child); return child;
    }});
  t.after(() => c.stop({clear: true}));
  return {dir, game, target, children, c, setTargets: value => { targets = value; }, setList: fn => { listOverride = fn; }};
}
function connected(child) {
  child.output({type: 'status', connected: true, message: 'connected'});
  child.output({type: 'streams', streams: [{id: 'a:b:c', name: 'Dialogue', sample: 'こんにちは', selected: true}, {id: 'd:e:f', name: 'Other', sample: '別の台詞'}]});
}
test('capture matches the exact library EXE and rejects arbitrary process names and paths', async t => {
  const f = fixture(t);
  f.setTargets([{...f.target, path: path.join(f.dir, 'other.exe')}, {...f.target, pid: -1}, {...f.target, hwnd: '0'}, f.target]);
  assert.equal((await f.c.targets([f.game])).length, 1);
  assert.equal((await f.c.targets([f.game, {...f.game, id: 'another-edition'}])).length, 2);
  await assert.rejects(f.c.start({...f.game, exePath: 'script.bat'}, f.dir), /EXE/);
  await assert.rejects(f.c.start(f.game, f.dir, '4233'), /进程无效/);
  assert.equal(f.children.length, 0);
  f.setTargets([{...f.target, path: path.join(f.dir, 'other.exe')}]);
  assert.equal((await f.c.start(f.game, f.dir)).status, 'waiting');
  assert.equal(f.children.length, 0);
});
test('armed capture connects after launch, selects only known streams, deduplicates redraws and preserves repeated dialogue', async t => {
  const f = fixture(t);
  await f.c.start(f.game, f.dir);
  f.setTargets([f.target]); await f.c.tick(f.c.generation);
  const child = f.children[0]; connected(child);
  assert.deepEqual(child.args, ['4233', f.target.hwnd, 'novel', f.target.started]);
  assert.equal(child.options.shell, false);
  const line = text => child.output({type: 'source', text, streamId: 'a:b:c', sourceName: 'Dialogue'});
  child.output({type: 'source', text: 'wrong stream', streamId: 'd:e:f'});
  line('こんにちは'); line('こんにちは'); line('また明日'); line('こんにちは');
  assert.deepEqual(f.c.state.history.map(e => e.text), ['こんにちは', 'また明日', 'こんにちは']);
  assert.throws(() => f.c.selectStream('unknown'), /失效/);
  f.c.selectStream('d:e:f'); assert.deepEqual(child.commands.at(-1), {type: 'select', id: 'd:e:f'});
  for (let i = 0; i < 120; i++) line('日本語 ' + i);
  assert.equal(f.c.state.history.length, 100);
  await f.c.stop();
  assert.equal(child.commands.at(-1).type, 'quit'); assert.equal(child.killed, undefined);
  assert.equal(f.c.state.status, 'idle'); assert.equal(f.c.state.latest.text, '日本語 119');
  child.output({type: 'source', text: 'late leak', streamId: 'a:b:c'});
  assert.equal(f.c.state.latest.text, '日本語 119');
});
test('stopping during a pending process scan cannot leave a helper running', async t => {
  const f = fixture(t); await f.c.start(f.game, f.dir);
  let release;
  f.setList(() => new Promise(resolve => { release = resolve; }));
  const scan = f.c.tick(f.c.generation);
  await f.c.stop({clear: true});
  release({stdout: JSON.stringify({type: 'targets', targets: [f.target]})}); await scan;
  assert.equal(f.children.length, 0); assert.equal(f.c.state.gameId, null); assert.equal(f.c.timer, null);
});
test('game exit can reconnect with a fresh identity, while account reset discards all captured text', async t => {
  const f = fixture(t); f.setTargets([f.target]); await f.c.start(f.game, f.dir);
  const first = f.children[0]; connected(first);
  first.output({type: 'source', text: 'private Japanese example', streamId: 'a:b:c'});
  first.output({type: 'status', connected: false, message: 'game exited'}); first.emit('close', 0);
  assert.equal(f.c.state.status, 'waiting');
  f.setTargets([{...f.target, pid: 4234, started: '639299171384739999'}]); await f.c.tick(f.c.generation);
  assert.equal(f.children[1].args[0], '4234');
  connected(f.children[1]);
  await f.c.stop({clear: true});
  assert.equal(f.c.state.latest, null); assert.deepEqual(f.c.state.history, []); assert.deepEqual(f.c.state.streams, []);
});
test('multiple game windows require a choice, native failure stops retries, and a hung helper is bounded', async t => {
  const f = fixture(t); f.setTargets([f.target, {...f.target, pid: 4234}]);
  assert.match((await f.c.start(f.game, f.dir)).message, /多个/); assert.equal(f.children.length, 0);
  await f.c.start(f.game, f.dir, 4234); const child = f.children[0];
  assert.equal(child.args[0], '4234');
  child.output({type: 'error', fatal: true, message: 'incompatible'});
  assert.equal(f.c.state.status, 'error'); assert.equal(f.c.armed, null); assert.equal(f.c.timer, null);
  child.stdin.removeAllListeners('data');
  await f.c.stop(); assert.equal(child.killed, true); assert.equal(f.c.child, null);
});
test('packaged helpers resolve outside ASAR and incomplete runtime folders fail before execution', () => {
  assert.equal(nativePath(path.join('C:\\app', 'resources', 'app.asar')), path.join('C:\\app', 'resources', 'app.asar.unpacked', 'assets', 'native', 'CaptureBridge.exe'));
  assert.throws(() => runtimeDirectory(''), /先选择/);
  assert.throws(() => runtimeDirectory('https://example.com'), /本机/);
});
