'use strict';
// Page-local polling updates only the capture panel, preserving unfinished vocabulary edits.
window.GalshelfCapture = {mount({root, games, API, h, button, busy, toast, onSentence, onWord}) {
  let disposed = false, polling = false, targets = [], configured = false, snapshot = null;
  let targetSignature = '', streamSignature = '', lastSentence = null, historySignature = '';
  const eligible = games.filter(g => /\.exe$/i.test(g.exePath));
  const game = h('select', {id: 'capture-game', 'aria-label': '抓取游戏'},
    ...eligible.map(g => h('option', {value: g.id}, g.title)));
  if (!eligible.length) game.append(h('option', {value: ''}, '请先从本机添加游戏 EXE'));
  const process = h('select', {id: 'capture-process', 'aria-label': '游戏运行进程'});
  const stream = h('select', {id: 'capture-stream', 'aria-label': '文本流'});
  const status = h('p', {id: 'capture-status', role: 'status', class: 'capture-status'}, '正在检查抓取组件…');
  const runtime = h('span', {class: 'capture-runtime'}, '未配置组件');
  const source = h('div', {id: 'capture-source', class: 'capture-source', 'aria-live': 'polite', tabindex: '0'}, '连接游戏并推进对话，台词会显示在这里。');
  const sample = h('p', {class: 'study-note capture-sample'});
  const follow = h('input', {id: 'capture-follow', type: 'checkbox', checked: true});
  const history = h('div', {id: 'capture-history', class: 'capture-history'});
  const run = async (target, fn) => { await busy(target, fn); if (!disposed) { await refresh(); if (snapshot) update(snapshot); } };
  const start = button('开始抓取', e => run(e.currentTarget, async () => {
    const pid = process.value ? Number(process.value) : undefined;
    update(await API.startCapture({gameId: game.value, pid}));
  }), 'button primary', 'play');
  start.id = 'capture-start'; start.disabled = true;
  const stop = button('停止抓取', e => run(e.currentTarget, async () => update(await API.stopCapture())), 'button subtle', 'close');
  stop.id = 'capture-stop'; stop.disabled = true;
  const launch = button('启动所选游戏', e => run(e.currentTarget, async () => {
    const result = await API.launchGame(game.value);
    if (result.ok) toast('游戏已启动，请推进对话。');
  }), 'button subtle', 'play');
  launch.id = 'capture-launch'; launch.disabled = !eligible.length;
  const configure = button('选择抓取组件', e => run(e.currentTarget, async () => {
    const result = await API.chooseCaptureRuntime();
    if (result) { update(result); toast('抓取组件已验证并保存。'); }
  }), 'button subtle small', 'folder');
  configure.id = 'capture-configure';
  const useSelection = button('选中文字 → 词语', () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !source.contains(selection.anchorNode) || !source.contains(selection.focusNode)) {
      toast('请先在上方台词中选中要学习的词语。', true); return;
    }
    const text = selection.toString().trim();
    if (!text || text.length > 100) { toast('请选择 1–100 字的词语。', true); return; }
    follow.checked = false;
    if (snapshot?.latest) onSentence(snapshot.latest.text);
    onWord(text);
  }, 'button subtle small', 'plus');
  useSelection.id = 'capture-use-selection';
  useSelection.addEventListener('mousedown', e => e.preventDefault());
  const useSentence = button('使用当前句', () => {
    if (snapshot?.latest) { follow.checked = false; onSentence(snapshot.latest.text); }
  }, 'button subtle small', 'book');
  useSentence.id = 'capture-use-sentence';
  game.addEventListener('change', updateTargets);
  process.addEventListener('change', updateTargets);
  stream.addEventListener('change', e => run(e.currentTarget, async () => {
    await API.selectCaptureStream(stream.value);
    lastSentence = null;
  }));
  follow.addEventListener('change', () => { if (follow.checked && snapshot?.latest) onSentence(snapshot.latest.text); });
  const panel = h('section', {class: 'study-panel capture-panel'},
    h('div', {class: 'capture-heading'}, h('div', {}, h('h2', {}, '从游戏实时读取台词'), h('p', {}, '选择库内游戏，开始抓取后可在这里直接学习。')), h('span', {class: 'capture-badge'}, 'LIVE READING')),
    h('div', {class: 'capture-controls'}, h('label', {}, '游戏', game), h('label', {}, '运行进程', process)),
    h('div', {class: 'study-actions'}, start, stop, launch), status,
    h('label', {class: 'capture-stream-label'}, '文本流 · 台词不对时在这里切换', stream), sample, source,
    h('div', {class: 'study-actions'}, useSelection, useSentence, h('label', {class: 'capture-follow'}, follow, '跟随最新台词填入学习区')),
    h('details', {class: 'capture-history-box'}, h('summary', {}, '本次台词记录 · 点击回看'), history),
    h('div', {class: 'capture-runtime-row'}, runtime, h('div', {class: 'study-actions'}, button('获取抓取组件', e => busy(e.currentTarget, () => API.openCaptureHelp()), 'button subtle small', 'external'), configure)),
    h('p', {class: 'study-note'}, '首次使用需选择 LunaHook 组件目录（LunaHost64.dll、LunaHook32.dll、LunaHook64.dll）。可使用 LunaTranslator 内的 files/LunaHook 文件夹。抓取仅连接你选择的本机游戏；台词记录仅留在本次内存中，保存生词时才写入本机。部分引擎需切换文本流，暂不支持所有游戏。'));
  root.append(panel);
  function updateTargets() {
    const matches = targets.filter(t => t.gameId === game.value);
    const signature = JSON.stringify(matches.map(t => [t.pid, t.started]));
    if (signature !== targetSignature || !process.options.length) {
      targetSignature = signature;
      const previous = process.value;
      process.replaceChildren(h('option', {value: ''}, matches.length ? (matches.length > 1 ? '请选择一个进程' : '自动连接运行中的游戏') : '等待游戏启动'));
      for (const t of matches) process.append(h('option', {value: String(t.pid)}, `${t.gameTitle} · PID ${t.pid}`));
      if (matches.some(t => String(t.pid) === previous)) process.value = previous;
    }
    start.disabled = !configured || !game.value || (matches.length > 1 && !process.value);
    launch.disabled = !game.value || matches.length > 0;
  }
  function update(next) {
    if (disposed) return;
    if (!snapshot && next.gameId && eligible.some(g => g.id === next.gameId)) game.value = next.gameId;
    snapshot = next; configured = next.configured;
    status.textContent = `${next.gameTitle ? next.gameTitle + ' · ' : ''}${next.message}${next.pid ? ' · PID ' + next.pid : ''}`;
    status.dataset.status = next.status;
    runtime.textContent = configured ? '抓取组件已就绪' : '首次使用：请选择抓取组件';
    stop.disabled = !next.armed && !next.connected && next.status !== 'connecting';
    const signature = JSON.stringify(next.streams);
    if (signature !== streamSignature) {
      streamSignature = signature;
      const previous = stream.value;
      stream.replaceChildren(h('option', {value: ''}, next.streams.length ? '选择台词文本流' : '推进游戏对话后显示文本流'));
      for (const s of next.streams) stream.append(h('option', {value: s.id}, `${s.selected ? '● ' : ''}${s.name} · ${s.sample.slice(0, 65) || '等待文本'}`));
      stream.value = next.selectedStreamId || previous;
    }
    stream.disabled = !next.connected || !next.streams.length;
    sample.textContent = next.streams.find(s => s.id === next.selectedStreamId)?.sample || '自动优先选择包含日文的台词流，也可以手动切换。';
    if (next.latest?.id !== lastSentence) {
      lastSentence = next.latest?.id ?? null;
      source.textContent = next.latest?.text || '连接游戏并推进对话，台词会显示在这里。';
      if (next.latest && follow.checked) onSentence(next.latest.text);
    }
    useSentence.disabled = !next.latest;
    const historyKey = next.history.map(e => e.id).join(',');
    if (historyKey !== historySignature) {
      historySignature = historyKey;
      history.replaceChildren(...[...next.history].reverse().map(entry => {
        const b = button(entry.text, () => { follow.checked = false; onSentence(entry.text); }, 'capture-history-entry');
        b.title = '使用这句话学习'; return b;
      }));
    }
    updateTargets();
  }
  let targetPoll = 0;
  async function refresh() {
    if (disposed || polling) return;
    polling = true;
    try {
      const next = await API.getCaptureState();
      if (disposed) return;
      update(next);
      if (++targetPoll % 5 === 1) { targets = await API.getCaptureTargets(); if (!disposed) updateTargets(); }
    } catch (error) { if (!disposed) status.textContent = error.message || '无法读取抓取状态，请重新打开此页面。'; }
    finally { polling = false; }
  }
  void refresh();
  const timer = setInterval(refresh, 900);
  return () => { disposed = true; clearInterval(timer); };
}};
