'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {StringDecoder} = require('node:string_decoder');
const {safeLocalPath} = require('./store');

const run = promisify(execFile);
const RUNTIME_DLLS = ['LunaHost64.dll', 'LunaHook32.dll', 'LunaHook64.dll'];
function nativePath(root = path.join(__dirname, '..')) {
  return path.join(root.replace(/app\.asar(?=[\\/]|$)/i, 'app.asar.unpacked'), 'assets', 'native', 'CaptureBridge.exe');
}
function runtimeDirectory(input) {
  const root = safeLocalPath(input, '抓取组件目录');
  if (!root) throw new Error('请先选择 LunaHook 组件目录。');
  for (const name of RUNTIME_DLLS) {
    const file = path.join(root, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('组件目录缺少 ' + name + '，请选择包含这三个 DLL 的 LunaHook 文件夹。');
  }
  return root;
}
function sameExecutable(a, b) {
  // Compare actual local files, never a process name alone. Resolves symlink aliases.
  try { return fs.realpathSync.native(a).toLowerCase() === fs.realpathSync.native(b).toLowerCase(); }
  catch { return false; }
}
function usableTarget(t) {
  return t && Number.isSafeInteger(t.pid) && t.pid > 0 && /^\d+$/.test(t.hwnd) && t.hwnd !== '0'
    && /^\d{15,20}$/.test(t.started) && typeof t.name === 'string' && t.name.length < 256
    && typeof t.path === 'string' && path.isAbsolute(t.path);
}
const cleanText = (value, max) => typeof value === 'string' ? value.replace(/\0/g, '').slice(0, max) : '';

class CaptureController {
  constructor(options = {}) {
    this.helper = options.helper || nativePath();
    this.run = options.run || run;
    this.spawn = options.spawn || spawn;
    this.interval = options.interval ?? 1400;
    this.stopTimeout = options.stopTimeout ?? 16000;
    this.timer = null;
    this.child = null;
    this.armed = null;
    this.generation = 0;
    this.sequence = 0;
    this.queue = Promise.resolve();
    this.scanning = false;
    this.state = this.emptyState();
  }
  emptyState() {
    return {status: 'idle', armed: false, connected: false, gameId: null, gameTitle: '', pid: null,
      message: '选择游戏并开始抓取；游戏未运行时会等待它启动。', streams: [], selectedStreamId: '', latest: null, history: []};
  }
  snapshot(runtime) {
    let configured = false;
    try { runtimeDirectory(runtime); configured = true; } catch {}
    return structuredClone({...this.state, configured});
  }
  serialize(fn) {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  async probe(runtime) {
    const root = runtimeDirectory(runtime);
    const {stdout} = await this.run(this.helper, ['--probe'], {env: {...process.env, GALSHELF_HOOK_ROOT: root},
      windowsHide: true, timeout: 8000, maxBuffer: 256 * 1024, encoding: 'utf8'}).catch(() => {
      throw new Error('抓取组件无法加载，请检查 LunaHook 版本、依赖和文件是否完整。');
    });
    const result = JSON.parse(stdout.trim());
    if (result.type !== 'probe' || !result.available) throw new Error('抓取组件不兼容。');
    return root;
  }
  async targets(games) {
    const {stdout} = await this.run(this.helper, ['--list'], {windowsHide: true, timeout: 6000, maxBuffer: 1024 * 1024, encoding: 'utf8'});
    const data = JSON.parse(stdout.trim());
    if (data.type !== 'targets' || !Array.isArray(data.targets)) throw new Error('无法读取运行中的游戏。');
    return data.targets.filter(usableTarget).flatMap(t => {
      return games.filter(g => path.extname(g.exePath).toLowerCase() === '.exe' && sameExecutable(t.path, g.exePath))
        .map(game => ({...t, gameId: game.id, gameTitle: game.title, title: cleanText(t.title, 200)}));
    });
  }
  start(game, runtime, pid) {
    return this.serialize(async () => {
      if (!game || path.extname(game.exePath || '').toLowerCase() !== '.exe') throw new Error('请在游戏编辑中直接选择游戏 EXE，快捷方式和脚本不能用于文本抓取。');
      safeLocalPath(game.exePath, '游戏启动文件', ['.exe']);
      if (!fs.existsSync(game.exePath)) throw new Error('游戏 EXE 不存在，请先修正游戏路径。');
      if (pid != null && (!Number.isSafeInteger(pid) || pid < 1)) throw new Error('游戏进程无效。');
      const root = await this.probe(runtime);
      await this.stopInner(true);
      this.armed = {game: structuredClone(game), root, pid: pid ?? null};
      this.state = {...this.emptyState(), status: 'waiting', armed: true, gameId: game.id, gameTitle: game.title, message: '等待游戏启动；连接后请推进对话。'};
      const generation = this.generation;
      this.timer = setInterval(() => void this.tick(generation), this.interval);
      this.timer.unref?.();
      await this.tick(generation);
      return this.snapshot(root);
    });
  }
  async tick(generation) {
    if (!this.armed || this.child || this.scanning || generation !== this.generation) return;
    this.scanning = true;
    const armed = this.armed;
    try {
      const matches = (await this.targets([armed.game])).filter(t => armed.pid == null || t.pid === armed.pid);
      if (generation !== this.generation || this.armed !== armed || this.child) return;
      if (!matches.length) return;
      if (matches.length > 1) { this.state.message = '检测到同一游戏的多个窗口，请选择一个运行进程后重新开始。'; return; }
      this.attach(matches[0], generation, armed.root);
      armed.pid = null; // A later restart may have a new PID; identity is re-enumerated.
    } catch (error) {
      if (generation === this.generation) this.fail('读取游戏进程失败：' + error.message);
    } finally { this.scanning = false; }
  }
  attach(target, generation, root) {
    this.state = {...this.state, status: 'connecting', connected: false, pid: target.pid, streams: [], selectedStreamId: '', message: '正在连接 ' + target.gameTitle + '…'};
    const child = this.spawn(this.helper, [String(target.pid), target.hwnd, target.name, target.started], {
      env: {...process.env, GALSHELF_HOOK_ROOT: root}, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe']
    });
    const record = {process: child, generation, heartbeat: Date.now()};
    record.done = new Promise(resolve => { record.resolve = resolve; });
    this.child = record;
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    child.stdout.on('data', chunk => {
      if (this.child !== record || generation !== this.generation) return;
      buffer += decoder.write(chunk);
      if (buffer.length > 256 * 1024) { buffer = ''; this.fail('抓取返回的文本过长，连接已停止。'); void this.stop(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (!line) continue;
        try { this.receive(JSON.parse(line), record); } catch {}
      }
    });
    child.stderr.on('data', () => {}); // Never save game text or native diagnostics to disk.
    child.stdin.on('error', () => {});
    const finished = error => {
      clearInterval(record.watchdog); clearTimeout(record.killTimer);
      record.resolve();
      if (this.child !== record) return;
      this.child = null;
      if (generation !== this.generation) return;
      if (error) this.fail('抓取程序启动失败：' + error.message);
      else if (this.state.status === 'connecting') this.fail('游戏连接未完成。请检查组件、运行权限，或重新开始。');
      else if (this.armed && this.state.status !== 'error') this.state = {...this.state, status: 'waiting', connected: false, pid: null, streams: [], selectedStreamId: '', message: '游戏已断开，等待所选游戏再次启动。'};
    };
    child.once('error', finished);
    child.once('close', code => {
      if (code && generation === this.generation && this.child === record && this.state.status !== 'error') this.fail('抓取程序意外退出，请检查组件后重新开始。');
      finished();
    });
    record.watchdog = setInterval(() => {
      if (Date.now() - record.heartbeat > 25000 && this.child === record) {
        this.fail('游戏连接长时间没有响应，请停止后重新开始。');
        this.send({type: 'quit'});
        clearInterval(record.watchdog);
        record.killTimer = setTimeout(() => { if (this.child === record) record.process.kill(); }, this.stopTimeout);
        record.killTimer.unref?.();
      }
    }, 5000);
    record.watchdog.unref?.();
  }
  receive(event, record) {
    if (record !== this.child || record.generation !== this.generation) return;
    if (event.type === 'heartbeat') record.heartbeat = Date.now();
    else if (event.type === 'status') {
      this.state.connected = event.connected === true;
      this.state.status = this.state.connected ? 'connected' : 'waiting';
      this.state.message = cleanText(event.message, 300);
    } else if (event.type === 'streams' && Array.isArray(event.streams)) {
      this.state.streams = event.streams.slice(0, 80).filter(s => s && typeof s.id === 'string' && /^[\da-f]+:[\da-f]+:[\da-f]+$/i.test(s.id)).map(s => ({
        id: s.id, name: cleanText(s.name, 150), sample: cleanText(s.sample, 160), selected: s.selected === true
      }));
      this.state.selectedStreamId = this.state.streams.find(s => s.selected)?.id || '';
    } else if (event.type === 'source') {
      const text = cleanText(event.text, 8000).trim();
      if (!text || event.streamId !== this.state.selectedStreamId) return;
      const previous = this.state.latest;
      // Repeated painting should not flood the lesson. A changed line resets deduplication.
      if (previous && previous.text === text && previous.streamId === event.streamId) return;
      const entry = {id: ++this.sequence, text, streamId: event.streamId, sourceName: cleanText(event.sourceName, 150), at: new Date().toISOString()};
      this.state.latest = entry;
      this.state.history = [...this.state.history, entry].slice(-100);
      this.state.message = '正在接收台词。可切换文本流，或选中文字加入生词本。';
    } else if (event.type === 'error') {
      this.state.message = cleanText(event.message, 500) || '抓取失败，请重新连接。';
      if (event.fatal) this.fail(this.state.message);
    }
  }
  fail(message) {
    clearInterval(this.timer); this.timer = null; this.armed = null;
    this.state = {...this.state, status: 'error', armed: false, connected: false, message};
  }
  send(command) {
    if (!this.child || !this.child.process.stdin.writable) return false;
    this.child.process.stdin.write(JSON.stringify(command) + '\n');
    return true;
  }
  selectStream(id) {
    if (typeof id !== 'string' || !this.state.streams.some(s => s.id === id)) throw new Error('文本流已失效，请重新选择。');
    if (!this.send({type: 'select', id})) throw new Error('游戏尚未连接。');
    return this.snapshot(this.armed?.root);
  }
  stop({clear = false} = {}) { return this.serialize(() => this.stopInner(clear)); }
  async stopInner(clear) {
    this.generation++;
    clearInterval(this.timer); this.timer = null; this.armed = null;
    const record = this.child;
    if (record) {
      this.send({type: 'quit'});
      let timer;
      await Promise.race([record.done, new Promise(resolve => { timer = setTimeout(() => { record.process.kill(); resolve(); }, this.stopTimeout); })]);
      clearTimeout(timer); clearInterval(record.watchdog); clearTimeout(record.killTimer);
      if (this.child === record) this.child = null;
    }
    this.state = clear ? this.emptyState() : {...this.state, status: 'idle', armed: false, connected: false, pid: null, streams: [], selectedStreamId: '', message: '已停止抓取；当前句子仍可用于学习。'};
    return this.snapshot();
  }
}
module.exports = {CaptureController, nativePath, runtimeDirectory, sameExecutable, usableTarget};
