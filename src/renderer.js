'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const API = window.gal;
  const statuses = { unplayed: '未开始', playing: '游玩中', finished: '已通关', paused: '搁置' };
  const palettes = [
    { value: '#a78bda', name: '紫藤', className: 'palette-purple' },
    { value: '#d793b3', name: '蔷薇', className: 'palette-rose' },
    { value: '#8eacd8', name: '雾蓝', className: 'palette-blue' },
    { value: '#8bc1a4', name: '薄荷', className: 'palette-green' },
    { value: '#d5b084', name: '暖砂', className: 'palette-amber' },
    { value: '#d58d94', name: '珊瑚', className: 'palette-red' },
  ];
  const paths = {
    library: ['M3 4h5v16H3z', 'M10 4h5v16h-5z', 'm17 5 4-1 3 15-4 1z'],
    grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
    heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'],
    check: ['m5 12 4 4L19 6'],
    completed: ['M9 11l3 3 8-9', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
    globe: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M3 12h18', 'M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z'],
    search: ['M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z', 'm15 15 6 6'],
    tag: ['M20 12l-8 8a2 2 0 0 1-3 0l-7-7V3h10l8 7a1.5 1.5 0 0 1 0 2Z', 'M7 7h.01'],
    clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 7v5l3 2'],
    play: ['m8 5 11 7-11 7Z'],
    plus: ['M12 5v14', 'M5 12h14'],
    close: ['m6 6 12 12', 'M18 6 6 18'],
    folder: ['M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z'],
    archive: ['M3 3h18v5H3z', 'M5 8v12h14V8', 'M10 12h4', 'M12 3v5'],
    edit: ['m16 3 5 5-12 12-6 1 1-6Z', 'm13 6 5 5'],
    trash: ['M3 6h18', 'M8 6V3h8v3', 'm5 6 1 15h12l1-15', 'M10 10v7', 'M14 10v7'],
    arrow: ['M4 12h16', 'm14 6 6 6-6 6'],
    external: ['M14 3h7v7', 'm21 3-9 9', 'M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5'],
    settings: ['M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z', 'm10 2-.7 3-2.7 1L4 5 2 8l2 2v3l-2 2 2 3 3-1 2 2 1 3h4l1-3 2-2 3 1 2-3-2-2v-3l2-2-2-3-3 1-2-1-.7-3Z'],
    import: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 16v5h16v-5'],
    export: ['M12 15V3', 'm7 8 5-5 5 5', 'M4 16v5h16v-5'],
    sparkle: ['m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z'],
    book: ['M12 6C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Z', 'M12 6v15'],
    info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 11v6', 'M12 7h.01'],
    user: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M4 21v-2a8 8 0 0 1 16 0v2'],
  };
  let state = { games: [], categories: [], sites: [], archiveTools: [], settings: {}, dataDir: '', account: { mode: 'local', user: null } };
  const ui = { page: 'library', categoryId: null, favorites: false, status: 'all', query: '', sort: 'recent', siteQuery: '', siteFilter: 'all' };
  let ready = false;
  let detailGameId = null;
  let accountBusy = false;
  let accountEpoch = 0;

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value') el.value = value;
      else if (key === 'checked' || key === 'disabled' || key === 'required' || key === 'readOnly') el[key] = Boolean(value);
      else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of paths[name] || paths.sparkle) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  function button(label, action, className = 'button', iconName) {
    return h('button', { type: 'button', class: className, onclick: action }, iconName ? icon(iconName) : null, label);
  }

  function iconButton(name, label, action) {
    return h('button', { type: 'button', class: 'icon-button', title: label, 'aria-label': label, onclick: action }, icon(name));
  }

  function palette(color) {
    if (!/^#[a-f0-9]{6}$/i.test(color || '')) return palettes[0].className;
    const rgb = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
    const target = rgb(color);
    return [...palettes].sort((a, b) => rgb(a.value).reduce((sum, part, index) => sum + (part - target[index]) ** 2, 0) - rgb(b.value).reduce((sum, part, index) => sum + (part - target[index]) ** 2, 0))[0].className;
  }
  function categoriesFor(game) { return (game.categories || []).map(id => state.categories.find(category => category.id === id)).filter(Boolean); }
  function seconds(game) { const value = Number(game.playSeconds); return Number.isFinite(value) ? Math.max(0, value) : 0; }
  function duration(value, compact = false) {
    const minutes = Math.floor((Number(value) || 0) / 60);
    if (minutes < 1) return compact ? '尚未游玩' : '0 分钟';
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    return `${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`;
  }
  function timeValue(value) { const number = typeof value === 'number' ? value : Date.parse(value || ''); return Number.isFinite(number) ? number : 0; }
  function shortDate(value) { const number = timeValue(value); return number ? new Date(number).toLocaleDateString('zh-CN') : '尚未游玩'; }
  function errorText(error) { return error && error.message ? error.message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '') : String(error || '操作失败，请重试。'); }

  function toast(message, error = false) {
    const region = $('#toast-region');
    const item = h('div', { class: `toast${error ? ' error' : ''}` }, icon(error ? 'info' : 'check'), h('span', {}, message));
    region.append(item);
    setTimeout(() => item.remove(), error ? 7000 : 4200);
  }

  async function busy(target, task) {
    if (target && target.disabled) return;
    const original = target ? target.disabled : false;
    if (target) { target.disabled = true; target.setAttribute('aria-busy', 'true'); }
    try { return await task(); }
    catch (error) { toast(errorText(error), true); return undefined; }
    finally { if (target) { target.disabled = original; target.removeAttribute('aria-busy'); } }
  }

  function applyState(next) {
    if (!next || !Array.isArray(next.games)) return;
    const previousUser = state.account?.user?.id || null;
    const nextUser = next.account === undefined ? previousUser : next.account?.user?.id || null;
    if (previousUser !== nextUser) {
      accountEpoch += 1;
      Object.assign(ui, { categoryId: null, favorites: false, status: 'all', query: '', sort: 'recent' });
      detailGameId = null;
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    }
    state = { ...state, ...next, categories: next.categories || [], sites: next.sites || [], archiveTools: next.archiveTools || state.archiveTools || [], settings: next.settings || {} };
    if (ui.categoryId && !state.categories.some(category => category.id === ui.categoryId)) ui.categoryId = null;
    render();
  }

  function navigate(page, options = {}) {
    Object.assign(ui, { page, categoryId: null, favorites: false, status: 'all', query: '' }, options);
    render();
    window.scrollTo({ top: 0 });
  }

  function navigationItem(label, name, active, action, count) {
    return h('button', { type: 'button', class: `nav-item${active ? ' active' : ''}`, onclick: action, 'aria-current': active ? 'page' : null }, icon(name), h('span', {}, label), count === undefined ? null : h('span', { class: 'nav-count' }, count));
  }

  function renderNavigation() {
    const isLibrary = ui.page === 'library';
    const navigation = $('#navigation');
    const first = h('div', { class: 'nav-group' }, h('div', { class: 'nav-label' }, '我的收藏'),
      navigationItem('游戏库', 'library', isLibrary && !ui.categoryId && !ui.favorites && ui.status !== 'finished', () => navigate('library'), state.games.length),
      navigationItem('我的收藏', 'heart', isLibrary && ui.favorites, () => navigate('library', { favorites: true }), state.games.filter(game => game.favorite).length),
      navigationItem('已通关', 'completed', isLibrary && ui.status === 'finished' && !ui.categoryId && !ui.favorites, () => navigate('library', { status: 'finished' }), state.games.filter(game => game.status === 'finished').length),
    );
    const second = h('div', { class: 'nav-group' }, h('div', { class: 'nav-label' }, '发现与整理'),
      navigationItem('分类管理', 'tag', ui.page === 'categories', () => navigate('categories')),
      navigationItem('搜索网站', 'globe', ui.page === 'sites', () => navigate('sites')),
      navigationItem('解压工具', 'archive', ui.page === 'archive-tools', () => navigate('archive-tools')),
    );
    const third = h('div', { class: 'nav-group' }, h('div', { class: 'nav-label' }, h('span', {}, '游戏分类'), iconButton('plus', '新建分类', () => openCategoryEditor())));
    for (const category of state.categories) {
      const active = isLibrary && ui.categoryId === category.id;
      third.append(h('button', { type: 'button', class: `nav-item category-nav ${palette(category.color)}${active ? ' active' : ''}`, onclick: () => navigate('library', { categoryId: category.id }), 'aria-current': active ? 'page' : null }, h('span', { class: 'category-dot' }), h('span', {}, category.name), h('span', { class: 'nav-count' }, state.games.filter(game => (game.categories || []).includes(category.id)).length)));
    }
    navigation.replaceChildren(first, second, third);
    const user = state.account?.user;
    $('#account-navigation').replaceChildren(h('button', { id: 'account-button', type: 'button', class: `account-nav${ui.page === 'account' ? ' active' : ''}`, onclick: () => navigate('account'), 'aria-current': ui.page === 'account' ? 'page' : null }, accountAvatar(user), h('span', { class: 'account-nav-copy' }, h('strong', {}, user?.displayId || '访客'), h('small', {}, user ? '本地账户 · 管理资料' : '本地账户 · 登录 / 注册')), icon('arrow')));
  }

  function render() {
    renderNavigation();
    $('#page-label').textContent = { library: '游戏库', categories: '分类管理', sites: '搜索网站', 'archive-tools': '解压工具', account: '本地账户' }[ui.page];
    const content = $('#page-content');
    content.setAttribute('aria-busy', 'false');
    content.replaceChildren();
    if (ui.page === 'categories') renderCategories(content);
    else if (ui.page === 'sites') renderSites(content);
    else if (ui.page === 'archive-tools') renderArchiveTools(content);
    else if (ui.page === 'account') renderAccount(content);
    else renderLibrary(content);
  }

  function heading(title, subtitle, eyebrow, action) {
    return h('div', { class: 'page-heading' }, h('div', {}, h('div', { class: 'eyebrow' }, eyebrow), h('h1', {}, title), h('p', { class: 'subtitle' }, subtitle)), action);
  }

  function statistic(name, value, unit, label) {
    return h('div', { class: 'stat-card' }, h('div', { class: 'stat-icon' }, icon(name)), h('div', {}, h('div', { class: 'stat-value' }, value, h('span', {}, unit)), h('div', { class: 'stat-label' }, label)));
  }

  function scopeGames() {
    return state.games.filter(game => (!ui.categoryId || (game.categories || []).includes(ui.categoryId)) && (!ui.favorites || game.favorite));
  }

  function filteredGames() {
    let games = scopeGames();
    if (ui.status !== 'all') games = games.filter(game => game.status === ui.status);
    const terms = ui.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) games = games.filter(game => {
      const haystack = [game.title, game.originalTitle, game.developer, game.notes, statuses[game.status], ...categoriesFor(game).map(category => category.name)].join(' ').toLocaleLowerCase();
      return terms.every(term => haystack.includes(term));
    });
    return games.sort((a, b) => {
      if (ui.sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
      if (ui.sort === 'time') return seconds(b) - seconds(a);
      if (ui.sort === 'added') return timeValue(b.addedAt) - timeValue(a.addedAt);
      if (ui.sort === 'favorite') return Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || timeValue(b.lastPlayed || b.addedAt) - timeValue(a.lastPlayed || a.addedAt);
      return timeValue(b.lastPlayed || b.addedAt) - timeValue(a.lastPlayed || a.addedAt);
    });
  }

  function renderLibrary(root) {
    const category = state.categories.find(item => item.id === ui.categoryId);
    const title = category ? category.name : ui.favorites ? '我的收藏' : '我的游戏库';
    const description = category ? `属于「${category.name}」的故事。每款游戏可以同时归入多个分类。` : ui.favorites ? '把偏爱的故事，留在触手可及的地方。' : '收藏每一次心动，让下一段故事从这里开始。';
    root.append(heading(title, description, category ? 'COLLECTION / CATEGORY' : 'YOUR PERSONAL COLLECTION', h('div', { class: 'heading-badge' }, icon('sparkle'), 'galshelf · 本地珍藏')));
    const games = scopeGames();
    const totalSeconds = games.reduce((sum, game) => sum + seconds(game), 0);
    root.append(h('div', { class: 'stats' }, statistic('library', games.length, '部', '收藏的故事'), statistic('completed', games.filter(game => game.status === 'finished').length, '部', '已通关'), statistic('clock', totalSeconds < 3600 ? Math.floor(totalSeconds / 60) : (totalSeconds / 3600).toFixed(1), totalSeconds < 3600 ? '分钟' : '小时', '累计游玩时间')));
    const search = h('input', { type: 'search', value: ui.query, placeholder: '搜索游戏名称、制作组、分类…', 'aria-label': '搜索游戏', autocomplete: 'off', oninput: event => { ui.query = event.target.value; renderLibraryResults(); } });
    const sort = h('select', { class: 'select-control', 'aria-label': '游戏排序', onchange: event => { ui.sort = event.target.value; renderLibraryResults(); } },
      ...[['recent', '最近游玩'], ['added', '最近添加'], ['title', '游戏名称'], ['time', '游玩时长'], ['favorite', '收藏优先']].map(([value, label]) => h('option', { value }, label)));
    sort.value = ui.sort;
    root.append(h('div', { class: 'library-toolbar' }, h('div', { class: 'search-box' }, icon('search'), search), h('div', { class: 'toolbar-end' }, h('span', { class: 'result-count', id: 'result-count' }), sort)));
    const filters = h('div', { class: 'filter-row', 'aria-label': '游玩状态筛选' });
    for (const [value, label] of [['all', '全部'], ...Object.entries(statuses)]) {
      const count = value === 'all' ? games.length : games.filter(game => game.status === value).length;
      filters.append(h('button', { type: 'button', class: `filter-chip${ui.status === value ? ' active' : ''}`, 'aria-pressed': String(ui.status === value), onclick: () => { ui.status = value; render(); } }, label, h('span', { class: 'chip-count' }, count)));
    }
    root.append(filters, h('div', { id: 'library-results' }));
    renderLibraryResults();
  }

  function emptyState(title, text, name, actions = []) {
    return h('div', { class: 'empty-state' }, h('div', { class: 'empty-icon' }, icon(name)), h('h2', {}, title), h('p', {}, text), actions.length ? h('div', { class: 'empty-actions' }, actions) : null);
  }

  function renderLibraryResults() {
    const root = $('#library-results');
    if (!root) return;
    const games = filteredGames();
    $('#result-count').textContent = `共 ${games.length} 部游戏`;
    if (!state.games.length) {
      root.replaceChildren(emptyState('从你的第一款本地游戏开始', '游戏库默认是空的。选择本机游戏的启动程序，或从游戏文件夹识别后添加；游戏文件始终留在你的电脑。', 'book', [button('添加本地游戏', () => openGameEditor(), 'button primary', 'plus'), button('从文件夹添加', event => addFromFolder(event.currentTarget), 'button subtle', 'folder')]));
      return;
    }
    if (!games.length) {
      const filtered = ui.query || ui.status !== 'all';
      root.replaceChildren(emptyState(filtered ? '没有找到符合条件的游戏' : ui.favorites ? '把喜欢的故事收藏起来' : '这个分类还没有游戏', filtered ? '试试其他关键词，或清除筛选条件。' : ui.favorites ? '打开游戏详情，点亮收藏，即可在这里快速找到它。' : '编辑游戏时勾选这个分类，即可把游戏收进这里。', filtered ? 'search' : 'tag', filtered ? [button('清除筛选', () => { ui.query = ''; ui.status = 'all'; render(); }, 'button subtle')] : [button('查看全部游戏', () => navigate('library'), 'button subtle')]));
      return;
    }
    root.replaceChildren(h('div', { class: 'section-line' }, h('h2', {}, ui.categoryId ? '分类中的故事' : ui.favorites ? '偏爱的故事' : '游戏收藏'), h('span', { class: 'section-note' }, '每一次重逢，都是新的开始')), h('div', { class: 'game-grid' }, games.map(game => gameCard(game))));
  }

  function coverContents(game, small = false) {
    const fallback = h('div', { class: 'cover-empty' }, h('span', { class: 'cover-initial' }, Array.from(game.title || 'galshelf').slice(0, 1).join('')), icon('book'), h('span', { class: 'cover-empty-label' }, 'galshelf'));
    const parts = [fallback];
    if (game.coverUrl && typeof game.coverUrl === 'string' && /^(file:|data:image\/)/i.test(game.coverUrl)) {
      const img = h('img', { class: small ? 'mini-cover' : 'cover-image', src: game.coverUrl, alt: '', loading: 'lazy', draggable: 'false', onerror: event => event.target.remove() });
      if (small) return [img];
      parts.push(img);
    }
    return parts;
  }

  function gameCard(game) {
    const cover = button('', () => openGameDetail(game.id), 'game-cover-button');
    cover.setAttribute('aria-label', `查看 ${game.title} 的详情`);
    cover.append(...coverContents(game), h('span', { class: 'cover-gradient' }), h('span', { class: `cover-status ${game.status || 'unplayed'}` }, statuses[game.status] || statuses.unplayed), game.favorite ? h('span', { class: 'card-favorite' }, icon('heart')) : document.createTextNode(''), h('span', { class: 'cover-hover' }, h('span', {}, '查看故事')));
    const categories = categoriesFor(game);
    const tags = h('div', { class: 'card-tags' });
    if (game.status === 'finished') tags.append(h('span', { class: 'tag completion-tag' }, icon('check'), '已通关'));
    for (const category of categories.slice(0, 2)) tags.append(h('span', { class: 'tag', title: category.name }, category.name));
    if (categories.length > 2) tags.append(h('span', { class: 'tag more-tag', title: categories.slice(2).map(category => category.name).join('、') }, `+${categories.length - 2}`));
    if (!categories.length) tags.append(h('span', { class: 'tag more-tag' }, '尚未分类'));
    const completed = game.status === 'finished';
    const completion = button(completed ? '取消通关' : '标记通关', event => changeGameStatus(game.id, completed ? 'unplayed' : 'finished', event.currentTarget), 'button subtle card-completed-toggle', 'check');
    completion.dataset.gameId = game.id;
    completion.setAttribute('aria-label', `${completed ? '取消' : '标记'} ${game.title} 的通关标签`);
    completion.setAttribute('aria-pressed', String(completed));
    return h('article', { class: 'game-card' }, cover, h('div', { class: 'card-info' }, h('h3', { class: 'card-title', title: game.title }, button(game.title, () => openGameDetail(game.id), 'title-button')), h('div', { class: 'card-developer', title: game.developer || '' }, game.developer || '未填写制作组'), tags, h('div', { class: 'card-footer' }, h('span', { class: 'card-time', title: duration(seconds(game)) }, icon('clock'), duration(seconds(game), true)), button('启动', event => launch(game.id, event.currentTarget), 'card-launch', 'play')), completion));
  }

  function renderCategories(root) {
    root.append(heading('分类，让故事各就其位', '按内容、题材或自己的习惯，建立专属收藏。', 'ORGANIZE YOUR STORIES', button('新建分类', () => openCategoryEditor(), 'button primary', 'plus')));
    root.append(h('div', { class: 'category-tip' }, icon('tag'), h('span', {}, '支持一款游戏拥有多个分类。例如「猎奇 + 悬疑」或「拔作 + 奇幻」；点击分类即可单独浏览。')));
    if (!state.categories.length) {
      root.append(emptyState('从第一个分类开始', '分类名称和颜色都由你定义。创建后，在游戏编辑页为游戏选择分类。', 'tag', [button('新建分类', () => openCategoryEditor(), 'button primary', 'plus')]));
      return;
    }
    root.append(h('div', { class: 'section-line' }, h('h2', {}, '全部分类'), h('span', { class: 'section-note' }, `${state.categories.length} 个分类 · 可自由编辑`)));
    const grid = h('div', { class: 'category-grid' });
    for (const category of state.categories) {
      const games = state.games.filter(game => (game.categories || []).includes(category.id));
      const covers = games.filter(game => game.coverUrl).slice(0, 3);
      const card = h('article', { class: `category-card ${palette(category.color)}` }, h('div', { class: 'category-card-top' }, h('div', { class: 'category-card-icon' }, icon('tag')), h('div', { class: 'category-card-actions' }, iconButton('edit', `编辑分类 ${category.name}`, () => openCategoryEditor(category)), iconButton('trash', `删除分类 ${category.name}`, () => removeCategory(category)))), h('button', { type: 'button', class: 'category-card-main', onclick: () => navigate('library', { categoryId: category.id }) }, h('h3', {}, category.name), h('p', {}, `${games.length} 部游戏 · ${games.filter(game => game.status === 'finished').length} 部已通关`), h('div', { class: 'category-card-footer' }, h('div', { class: 'cover-stack' }, covers.map(game => h('img', { class: 'mini-cover', src: game.coverUrl, alt: '', loading: 'lazy', onerror: event => event.target.remove() }))), h('span', {}, '浏览分类'), icon('arrow'))));
      grid.append(card);
    }
    root.append(grid);
  }

  function renderSites(root) {
    root.append(heading('寻找下一次心动', '从资料检索到官方商店，在熟悉的网站继续探索。', 'DISCOVER YOUR NEXT STORY', h('div', { class: 'heading-badge' }, icon('external'), '在默认浏览器中打开')));
    const search = h('input', { type: 'search', value: ui.siteQuery, placeholder: '输入游戏名称、原名或制作组…', 'aria-label': '网站搜索关键词', autocomplete: 'off', oninput: event => { ui.siteQuery = event.target.value; } });
    root.append(h('div', { class: 'sites-search-panel' }, h('div', {}, h('h2', {}, '一个关键词，多个搜索入口'), h('p', {}, '搜索资料与商店，或访问导航页发现更多网站。')), h('div', { class: 'search-box' }, icon('search'), search)));
    const kinds = [...new Set(state.sites.map(site => site.kind).filter(Boolean))];
    const filters = h('div', { class: 'filter-row' });
    for (const [value, name] of [['all', '全部网站'], ...kinds.map(kind => [kind, kind])]) filters.append(h('button', { type: 'button', class: `filter-chip${ui.siteFilter === value ? ' active' : ''}`, 'aria-pressed': String(ui.siteFilter === value), onclick: () => { ui.siteFilter = value; render(); } }, name));
    root.append(filters);
    const sites = state.sites.filter(site => ui.siteFilter === 'all' || site.kind === ui.siteFilter);
    if (!sites.length) { root.append(emptyState('暂无网站', '可用的游戏资料与商店入口将在这里显示。', 'globe')); return; }
    const grid = h('div', { class: 'sites-grid' });
    for (const site of sites) {
      let domain = '';
      try { domain = new URL(site.home).hostname.replace(/^www\./, ''); } catch { domain = ''; }
      const title = h('div', { class: 'site-top' }, h('div', { class: 'site-monogram' }, Array.from(site.name || 'G')[0]), h('div', {}, h('h3', { class: 'site-title' }, site.name), h('div', { class: 'site-domain' }, domain)));
      grid.append(h('article', { class: 'site-card' }, title, h('p', { class: 'site-description' }, site.description || ''), h('div', { class: 'site-meta' }, site.kind ? h('span', { class: 'tag' }, site.kind) : null, site.language ? h('span', { class: 'tag' }, site.language) : null), h('div', { class: 'site-actions' }, button(site.searchTemplate ? '访问主页' : '访问导航', event => busy(event.currentTarget, () => API.openSite({ id: site.id, query: '' })), 'button subtle small', 'external'), site.searchTemplate ? button('搜索', event => {
        if (!ui.siteQuery.trim()) { search.focus(); toast('先输入想寻找的游戏名称。'); return; }
        busy(event.currentTarget, () => API.openSite({ id: site.id, query: ui.siteQuery.trim() }));
      }, 'button small', 'search') : null)));
    }
    root.append(grid, h('p', { class: 'site-notice' }, '搜索结果由目标网站提供。分类用于整理你的本地游戏；各网站的内容分级、访问规则与搜索能力以其自身说明为准。'));
  }

  function renderArchiveTools(root) {
    root.append(heading('解压工具', '把压缩包整理好，为下一段故事做好准备。', 'TOOLS FOR YOUR COLLECTION', h('div', { class: 'heading-badge' }, icon('external'), '官方下载入口')));
    root.append(h('div', { class: 'archive-intro' }, h('div', { class: 'archive-intro-icon' }, icon('archive')), h('div', {}, h('h2', {}, '常用解压软件，一处找到'), h('p', {}, '选择适合自己的工具，前往软件官网查看版本并下载。')), h('span', { class: 'archive-platform' }, 'Windows')));
    if (!state.archiveTools.length) {
      root.append(emptyState('暂无解压工具', '可用的官方下载入口将在这里显示。', 'archive'));
      return;
    }
    const grid = h('div', { class: 'archive-tools-grid' });
    for (const tool of state.archiveTools) {
      let domain = '';
      try { domain = new URL(tool.home).hostname.replace(/^www\./, ''); } catch { domain = ''; }
      const badge = tool.name === '7-Zip' ? '7z' : tool.name === 'WinRAR' ? 'RAR' : 'ZIP';
      const facts = h('dl', { class: 'archive-tool-facts' });
      for (const [label, value] of [['平台', tool.platform], ['许可', tool.license], ['来源', tool.sourceLabel]]) {
        if (value) facts.append(h('div', {}, h('dt', {}, label), h('dd', {}, value)));
      }
      grid.append(h('article', { class: 'archive-tool-card' },
        h('div', { class: 'archive-tool-top' }, h('div', { class: 'archive-tool-mark' }, h('span', {}, badge), icon('archive')), tool.kind ? h('span', { class: 'tag' }, tool.kind) : null),
        h('h2', {}, tool.name), h('p', { class: 'archive-tool-domain' }, domain), h('p', { class: 'archive-tool-description' }, tool.description || ''), facts,
        button('前往官方下载', event => busy(event.currentTarget, () => API.openArchiveTool(tool.id)), 'button subtle archive-tool-download', 'external')));
    }
    root.append(grid, h('div', { class: 'archive-quick-tip' }, icon('folder'), h('p', {}, '解压完成后，回到游戏库，点击「从文件夹添加」并选择游戏所在文件夹。')));
  }

  function accountAvatar(user, large = false) {
    const avatar = h('span', { class: `account-avatar${large ? ' large' : ''}`, 'aria-hidden': 'true' }, user ? Array.from(user.displayId || user.loginName || 'G')[0] : icon('user'));
    if (typeof user?.avatarUrl === 'string' && /^(file:|data:image\/)/i.test(user.avatarUrl)) avatar.append(h('img', { src: user.avatarUrl, alt: '', onerror: event => event.target.remove() }));
    return avatar;
  }

  async function accountRequest(error, operation, message) {
    if (accountBusy) return;
    accountBusy = true;
    const controls = [...document.querySelectorAll('.account-action')];
    for (const control of controls) { control.disabled = true; control.setAttribute('aria-busy', 'true'); }
    setError(error, null);
    try {
      const next = await operation();
      for (const input of document.querySelectorAll('.account-form input[type="password"]')) input.value = '';
      applyState(next);
      if (message) toast(message);
    } catch (err) { setError(error, err); }
    finally {
      accountBusy = false;
      for (const control of document.querySelectorAll('.account-action')) { control.disabled = false; control.removeAttribute('aria-busy'); }
    }
  }

  function renderAccount(root) {
    const user = state.account?.user;
    root.append(heading('本地账户', '给你的收藏一个专属空间。账户、头像和游戏库保存在这台电脑。', 'YOUR LOCAL PROFILE', h('div', { class: 'heading-badge' }, icon('user'), 'LOCAL ONLY')));
    root.append(h('div', { class: 'account-notice' }, icon('info'), h('p', {}, '每个账户都有独立的游戏库，新账户从空库开始。你也可以直接以访客身份添加游戏；退出登录会回到访客游戏库。重启应用后需重新登录，账户不在设备间同步。')));
    if (user) {
      const error = h('div', { id: 'profile-error', class: 'inline-error', role: 'alert' });
      const displayId = h('input', { id: 'profile-display-id', class: 'text-input', type: 'text', required: true, maxlength: 32, value: user.displayId || '', autocomplete: 'nickname' });
      const chooseAvatar = h('button', { id: 'avatar-choose', type: 'button', class: 'button subtle account-action', disabled: accountBusy, onclick: () => accountRequest(error, () => API.chooseAvatar()) }, icon('folder'), '选择本地头像');
      const removeAvatar = h('button', { id: 'avatar-remove', type: 'button', class: 'button ghost account-action', disabled: accountBusy, onclick: () => accountRequest(error, () => API.removeAvatar(), '已移除头像。') }, '移除头像');
      const save = h('button', { id: 'profile-save', type: 'submit', class: 'button primary account-action', disabled: accountBusy }, icon('check'), '保存资料');
      const form = h('form', { id: 'profile-form', class: 'account-form profile-panel' },
        h('div', { class: 'profile-header' }, accountAvatar(user, true), h('div', {}, h('h2', {}, user.displayId), h('p', { class: 'profile-login-name' }, `登录名：${user.loginName}`), h('span', { class: 'tag' }, '已登录 · 仅在本机'))),
        error, h('div', { class: 'profile-avatar-actions' }, chooseAvatar, user.avatarUrl ? removeAvatar : null),
        h('p', { class: 'field-help profile-avatar-help' }, '从本机选择一张图片作为头像，图片不会上传。'),
        field('显示 ID', displayId, { required: true, help: '1–32 个字符，可使用中文；登录名保持不变。' }),
        h('div', { class: 'profile-actions' }, save, h('button', { id: 'logout-button', type: 'button', class: 'button ghost account-action', disabled: accountBusy, onclick: () => accountRequest(error, () => API.logoutAccount(), '已退出登录，当前为访客游戏库。') }, '退出登录')));
      form.addEventListener('submit', event => { event.preventDefault(); if (!form.reportValidity() || accountBusy) return; if (!displayId.value.trim()) { setError(error, new Error('请填写显示 ID。')); return; } accountRequest(error, () => API.updateProfile({ displayId: displayId.value.trim() }), '账户资料已保存。'); });
      root.append(form);
      return;
    }
    const grid = h('div', { class: 'account-grid' });
    for (const registering of [false, true]) {
      const prefix = registering ? 'register' : 'login';
      const error = h('div', { id: `${prefix}-error`, class: 'inline-error', role: 'alert' });
      const loginName = h('input', { id: `${prefix}-name`, class: 'text-input', type: 'text', required: true, minlength: 3, maxlength: 32, pattern: '[A-Za-z0-9_\\-]{3,32}', placeholder: '例如 story_reader', autocomplete: 'username', spellcheck: 'false' });
      const password = h('input', { id: `${prefix}-password`, class: 'text-input', type: 'password', required: true, minlength: 8, maxlength: 128, placeholder: '8–128 个字符', autocomplete: registering ? 'new-password' : 'current-password' });
      const displayId = registering ? h('input', { id: 'register-display-id', class: 'text-input', type: 'text', required: true, maxlength: 32, placeholder: '你的显示名称', autocomplete: 'nickname' }) : null;
      const confirmation = registering ? h('input', { id: 'register-password-confirm', class: 'text-input', type: 'password', required: true, minlength: 8, maxlength: 128, placeholder: '再次输入密码', autocomplete: 'new-password' }) : null;
      const submit = h('button', { id: `${prefix}-submit`, type: 'submit', class: `button ${registering ? 'subtle' : 'primary'} account-action`, disabled: accountBusy }, registering ? '创建本地账户' : '登录');
      const form = h('form', { id: `${prefix}-form`, class: 'account-form account-panel' }, h('div', { class: 'account-panel-heading' }, h('h2', {}, registering ? '创建你的账户' : '欢迎回来'), h('p', {}, registering ? '新账户拥有自己的空游戏库。' : '登录后继续整理你自己的收藏。')), error,
        field('登录名', loginName, { required: true, help: '3–32 位英文字母、数字、下划线或短横线。' }),
        displayId ? field('显示 ID', displayId, { required: true, help: '1–32 个字符，可使用中文，之后可以修改。' }) : null,
        field('密码', password, { required: true }), confirmation ? field('确认密码', confirmation, { required: true }) : null, submit);
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity() || accountBusy) return;
        if (registering && password.value !== confirmation.value) { setError(error, new Error('两次输入的密码不一致。')); confirmation.focus(); return; }
        if (registering && !displayId.value.trim()) { setError(error, new Error('请填写显示 ID。')); displayId.focus(); return; }
        accountRequest(error, () => registering ? API.registerAccount({ loginName: loginName.value, password: password.value, displayId: displayId.value.trim() }) : API.loginAccount({ loginName: loginName.value, password: password.value }), registering ? '本地账户已创建，你的游戏库准备好了。' : '已登录本地账户。');
      });
      grid.append(form);
    }
    root.append(grid, h('p', { class: 'account-footnote' }, '无需邮箱或网络账户。本地账户用于分开管理收藏，请妥善保管密码；所有游戏都需要自行从本机添加。'));
  }

  function openDialog(dialog, content) {
    dialog.replaceChildren(...(Array.isArray(content) ? content : [content]));
    if (!dialog.open) dialog.showModal();
  }

  function dialogHeader(title, subtitle, id, dialog) {
    return h('div', { class: 'modal-header' }, h('div', {}, h('h2', { id }, title), subtitle ? h('p', {}, subtitle) : null), iconButton('close', '关闭', () => dialog.close()));
  }

  function setError(container, error) {
    container.textContent = error ? errorText(error) : '';
    container.classList.toggle('visible', Boolean(error));
    if (error) container.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function field(label, input, options = {}) {
    return h('div', { class: `form-field${options.full ? ' full-width' : ''}` }, h('label', { for: input.id }, label, options.required ? h('span', { class: 'required' }, ' *') : null), input, options.help ? h('p', { class: 'field-help' }, options.help) : null);
  }

  function pathField(label, input, kind, help) {
    return h('div', { class: 'form-field full-width' }, h('label', { for: input.id }, label), h('div', { class: 'path-field' }, input, button('选择', event => busy(event.currentTarget, async () => { const result = await API.pickFile({ kind }); if (result) { input.value = result; input.dispatchEvent(new Event('input')); } }), 'button subtle', 'folder')), help ? h('p', { class: 'field-help' }, help) : null);
  }

  async function addFromFolder(target) {
    if (!ready) return;
    await busy(target, async () => {
      const epoch = accountEpoch;
      const result = await API.chooseGameFolder();
      if (result && epoch === accountEpoch) openGameEditor(undefined, result);
    });
  }

  function openGameEditor(gameId, folderData) {
    const original = gameId ? state.games.find(game => game.id === gameId) : null;
    const dialog = $('#editor-dialog');
    const editorEpoch = accountEpoch;
    const form = h('form', {});
    const title = h('input', { id: 'game-title', class: 'text-input', type: 'text', value: original?.title || '', required: true, maxlength: 200, placeholder: '游戏的显示名称', autocomplete: 'off' });
    const originalTitle = h('input', { id: 'game-original-title', class: 'text-input', type: 'text', value: original?.originalTitle || '', placeholder: '可选，填写原文名称', maxlength: 300 });
    const developer = h('input', { id: 'game-developer', class: 'text-input', type: 'text', value: original?.developer || '', placeholder: '制作组 / 品牌', maxlength: 200 });
    const status = h('select', { id: 'game-status', class: 'text-input' }, ...Object.entries(statuses).map(([value, label]) => h('option', { value }, label)));
    status.value = original?.status || 'unplayed';
    let previousStatus = status.value === 'finished' ? 'unplayed' : status.value;
    const completed = h('input', { id: 'game-completed', type: 'checkbox', checked: status.value === 'finished' });
    status.addEventListener('change', () => { completed.checked = status.value === 'finished'; if (!completed.checked) previousStatus = status.value; });
    completed.addEventListener('change', () => { if (completed.checked) { if (status.value !== 'finished') previousStatus = status.value; status.value = 'finished'; } else status.value = previousStatus; });
    const exe = h('input', { id: 'game-exe', class: 'text-input', type: 'text', value: original?.exePath || '', placeholder: '选择游戏的 .exe 或启动快捷方式' });
    const cover = h('input', { id: 'game-cover', class: 'text-input', type: 'text', value: original?.coverPath || '', placeholder: '选择本地图片作为游戏封面' });
    const workDir = h('input', { id: 'game-workdir', class: 'text-input', type: 'text', value: original?.workDir || '', placeholder: '留空时使用游戏程序所在目录' });
    const args = h('textarea', { id: 'game-args', class: 'text-area', rows: 2, placeholder: '每行一个参数，无需自行添加引号', value: Array.isArray(original?.args) ? original.args.join('\n') : '' });
    const notes = h('textarea', { id: 'game-notes', class: 'text-area', rows: 3, placeholder: '记录游玩感受、推荐线路或下一次想去的地方…', value: original?.notes || '', maxlength: 20000 });
    const favorite = h('input', { type: 'checkbox', checked: Boolean(original?.favorite) });
    const locale = h('input', { type: 'checkbox', checked: original?.launchMode === 'locale' });
    const categories = h('div', { class: 'category-checks' });
    for (const category of state.categories) categories.append(h('label', { class: 'category-check' }, h('input', { type: 'checkbox', value: category.id, checked: (original?.categories || []).includes(category.id), name: 'category' }), category.name));
    if (!state.categories.length) categories.append(h('span', { class: 'field-help' }, '暂无分类，先在分类管理中创建一个。'));
    const error = h('div', { class: 'inline-error', role: 'alert' });
    const scanNotice = h('p', { id: 'game-folder-notice', class: 'field-help', role: 'status' }, '选择一个游戏文件夹，识别启动文件和名称后逐款确认添加。');
    const candidates = h('select', { id: 'game-executable-candidates', class: 'text-input', 'aria-label': '选择识别到的启动程序' });
    const candidateField = field('识别到的启动程序', candidates, { full: true, help: '如果文件夹中有多款游戏，请为当前这款选择正确的启动文件。' });
    candidateField.hidden = true;
    let searchVersion = 0;
    let metadataApplying = false;
    const editorCurrent = () => dialog.open && form.isConnected && editorEpoch === accountEpoch;
    const metadataError = h('div', { id: 'metadata-error', class: 'inline-error', role: 'alert' });
    const metadataStatus = h('p', { id: 'metadata-status', class: 'field-help', role: 'status' }, '检索 VNDB 视觉小说库，对照名称、制作组和年份后，选择正确作品应用封面。');
    const metadataNormalized = h('p', { id: 'metadata-query-normalized', class: 'metadata-normalized', hidden: true });
    const metadataResults = h('div', { id: 'metadata-results', class: 'metadata-results' });
    const metadataQuery = h('input', { id: 'metadata-query', class: 'text-input', type: 'search', value: original?.title || '', placeholder: '游戏名称、v4 或 https://vndb.org/v4', maxlength: 200, autocomplete: 'off', oninput: () => { searchVersion += 1; metadataResults.replaceChildren(); metadataNormalized.hidden = true; metadataStatus.textContent = '关键词已更新，点击搜索获取 VNDB 视觉小说作品。'; setError(metadataError, null); } });
    metadataQuery.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); if (!metadataSearch.disabled) searchMetadata(); } });
    const metadataSearch = h('button', { id: 'metadata-search-button', type: 'button', class: 'button subtle', onclick: () => searchMetadata() }, icon('search'), '搜索 VNDB');
    async function selectMetadata(item) {
      if (metadataApplying || !editorCurrent()) return;
      metadataApplying = true;
      const version = searchVersion;
      save.disabled = true;
      for (const control of metadataResults.querySelectorAll('button')) control.disabled = true;
      setError(metadataError, null);
      metadataStatus.textContent = '正在保存所选作品的封面…';
      try {
        const result = await API.metadataCover({ id: item.id });
        if (!editorCurrent() || version !== searchVersion) return;
        title.value = item.title || title.value;
        originalTitle.value = item.originalTitle || '';
        developer.value = item.developer || '';
        if (!notes.value.trim() && item.summary) notes.value = String(item.summary).slice(0, 5000);
        cover.value = result?.coverPath || '';
        metadataStatus.textContent = result?.coverPath ? '已应用作品资料与封面。确认启动程序和分类后，点击下方保存。' : '已应用作品资料；该作品暂无可用封面，你可以选择本地图片。';
        for (const control of metadataResults.querySelectorAll('button')) control.classList.toggle('selected', control.dataset.metadataId === String(item.id));
      } catch (err) {
        if (!editorCurrent() || version !== searchVersion) return;
        setError(metadataError, err);
        metadataStatus.textContent = '所选作品的封面获取失败，尚未应用该条目。请重试，或手动填写资料并选择本地封面。';
      } finally {
        metadataApplying = false;
        save.disabled = false;
        for (const control of metadataResults.querySelectorAll('button')) control.disabled = false;
      }
    }
    async function searchMetadata() {
      const query = metadataQuery.value.trim();
      if (!query) { setError(metadataError, new Error('先输入游戏名称、VNDB 条目 ID 或条目网址。')); metadataQuery.focus(); return; }
      const version = ++searchVersion;
      metadataSearch.disabled = true;
      metadataSearch.setAttribute('aria-busy', 'true');
      setError(metadataError, null);
      metadataResults.replaceChildren();
      metadataNormalized.hidden = true;
      metadataStatus.textContent = '正在检索 VNDB 视觉小说库…';
      try {
        const result = await API.searchMetadata(query);
        if (!editorCurrent() || version !== searchVersion) return;
        const results = Array.isArray(result?.results) ? result.results.slice(0, 12) : [];
        const normalizedQuery = typeof result?.normalizedQuery === 'string' ? result.normalizedQuery.trim() : '';
        metadataNormalized.hidden = !normalizedQuery || normalizedQuery === query;
        metadataNormalized.textContent = normalizedQuery ? `实际检索：${normalizedQuery}` : '';
        metadataStatus.textContent = results.length ? `VNDB 返回 ${results.length} 个视觉小说条目，请对照资料并点击正确作品；不会自动应用首项或保存游戏。` : 'VNDB 未找到匹配作品。请尝试日文名、英文名或 VNDB 条目 ID，也可以手动添加资料和封面。';
        for (const item of results) {
          const thumb = h('span', { class: 'metadata-thumb' }, icon('book'));
          try { const url = new URL(item.coverUrl); if (url.origin === 'https://t.vndb.org' && !url.username && !url.password && url.pathname.startsWith('/cv/')) thumb.append(h('img', { src: url.href, alt: '', loading: 'lazy', onerror: event => event.target.remove() })); } catch {}
          const releasedYear = /^\d{4}(?:-|$)/.exec(String(item.released || ''))?.[0].slice(0, 4);
          const details = [item.developer, releasedYear ? `${releasedYear} 年` : ''].filter(Boolean).join(' · ');
          metadataResults.append(h('button', { type: 'button', class: 'metadata-select', 'data-metadata-id': item.id, disabled: metadataApplying, onclick: () => selectMetadata(item) }, thumb, h('span', { class: 'metadata-copy' }, h('strong', {}, item.title || item.originalTitle || '未命名作品'), item.originalTitle && item.originalTitle !== item.title ? h('span', {}, item.originalTitle) : null, details ? h('span', { class: 'metadata-details', title: details }, details) : null, h('small', { class: 'metadata-source' }, `VNDB · ${item.id}`), h('small', { class: 'metadata-match' }, item.matchLabel || '候选作品')), icon('plus')));
        }
      } catch (err) {
        if (!editorCurrent() || version !== searchVersion) return;
        setError(metadataError, err);
        metadataStatus.textContent = 'VNDB 在线检索暂时不可用，本机启动文件已保留。连接恢复后可尝试日文名、英文名或条目 ID；也可以手动填写并选择本地封面。';
      } finally {
        metadataSearch.disabled = false;
        metadataSearch.removeAttribute('aria-busy');
      }
    }
    function selectExecutable(value) {
      exe.value = value || '';
      if (value) workDir.value = value.replace(/[\\/][^\\/]+$/, '');
    }
    candidates.addEventListener('change', () => selectExecutable(candidates.value));
    async function applyFolder(result) {
      if (!result || !editorCurrent()) return;
      if (result.title) title.value = result.title;
      const options = Array.isArray(result.executables) ? result.executables : [];
      candidates.replaceChildren(...options.map(item => h('option', { value: item.path }, item.relativePath || item.path)));
      candidateField.hidden = !options.length;
      const chosen = options.find(item => item.path === result.suggestedExe)?.path || options[0]?.path || '';
      candidates.value = chosen;
      selectExecutable(chosen);
      if (!chosen) workDir.value = result.folder || '';
      scanNotice.textContent = `${options.length ? `找到 ${options.length} 个启动程序，请确认当前选择。` : '没有找到可用的启动程序，可以手动选择启动文件。'}${result.warning ? ` ${result.warning}` : ''}`;
      metadataQuery.value = title.value;
      if (metadataQuery.value.trim()) await searchMetadata();
    }
    const folderButton = h('button', { id: 'game-folder-button', type: 'button', class: 'button subtle', onclick: event => busy(event.currentTarget, async () => { const result = await API.chooseGameFolder(); if (result) await applyFolder(result); }) }, icon('folder'), '选择游戏文件夹');
    const recognition = h('section', { class: 'game-recognition', 'aria-label': '本地游戏识别' }, h('div', { class: 'recognition-heading' }, h('div', {}, h('h3', {}, '从本机文件夹开始'), scanNotice), folderButton), candidateField,
      h('div', { class: 'metadata-search-row' }, h('label', { for: 'metadata-query', class: 'sr-only' }, 'VNDB 作品名称、条目 ID 或网址'), metadataQuery, metadataSearch), metadataError, metadataStatus, metadataNormalized, metadataResults,
      h('p', { class: 'metadata-privacy' }, '只使用 VNDB 视觉小说条目的封面。检索仅发送作品关键词或条目 ID；游戏文件、本地路径和账户资料不会上传。'));
    const completionField = h('div', { class: 'form-field full-width completion-field' }, h('label', { class: 'check-label', for: 'game-completed' }, completed, icon('check'), '已通关 · 添加通关标签'), h('p', { class: 'field-help' }, '保存后显示“已通关”标签，并收进侧栏的“已通关”游戏库。'));
    const body = h('div', { class: 'modal-body' }, error, recognition, h('div', { class: 'form-grid' }, field('游戏名称', title, { required: true }), field('原文名称', originalTitle), field('制作组', developer), field('游玩状态', status), completionField, pathField('启动程序', exe, 'game', '未填写时，首次启动会提示选择程序。'), pathField('游戏封面', cover, 'cover'), field('分类 · 可多选', categories, { full: true }), h('div', { class: 'form-field full-width' }, h('label', { class: 'check-label' }, favorite, icon('heart'), '加入我的收藏'))), h('h3', { class: 'form-section-label' }, '启动设置'), h('div', { class: 'form-grid' }, pathField('工作目录', workDir, 'folder'), field('启动参数', args, { full: true }), h('div', { class: 'form-field full-width' }, h('label', { class: 'check-label' }, locale, '使用 Locale Emulator 转区启动'), h('p', { class: 'field-help' }, '适用于需要日语区域设置的游戏。可在设置中指定 Locale Emulator。')), field('我的笔记', notes, { full: true })));
    const save = h('button', { class: 'button primary', type: 'submit' }, icon('check'), original ? '保存修改' : '加入游戏库');
    form.append(dialogHeader(original ? '编辑游戏' : '添加本地游戏', original ? '整理这段故事的资料与启动方式。' : '选择你电脑上的游戏，确认资料后加入游戏库。', 'editor-title', dialog), body, h('div', { class: 'modal-footer' }, h('span', { class: 'form-footer-note' }, '游戏文件保留在原位置'), button('取消', () => dialog.close(), 'button subtle'), save));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (save.disabled || !form.reportValidity()) return;
      if (!title.value.trim()) { title.setCustomValidity('请输入游戏名称。'); title.reportValidity(); title.setCustomValidity(''); return; }
      save.disabled = true;
      setError(error, null);
      try {
        const game = { ...(original || {}), title: title.value.trim(), originalTitle: originalTitle.value.trim(), developer: developer.value.trim(), status: status.value, exePath: exe.value.trim(), coverPath: cover.value.trim(), workDir: workDir.value.trim(), args: args.value.split(/\r?\n/).map(arg => arg.trim()).filter(Boolean), categories: [...categories.querySelectorAll('input:checked')].map(input => input.value), favorite: favorite.checked, notes: notes.value, launchMode: locale.checked ? 'locale' : 'normal' };
        const result = await API.saveGame(game);
        applyState(result);
        dialog.close();
        toast(original ? '游戏资料已保存。' : '已加入游戏库。');
        if (original && $('#detail-dialog').open) openGameDetail(original.id);
      } catch (err) { setError(error, err); }
      finally { save.disabled = false; }
    });
    openDialog(dialog, form);
    if (folderData) applyFolder(folderData);
  }

  async function launch(id, target) {
    await busy(target, async () => {
      const result = await API.launchGame(id);
      if (result?.canceled) return;
      if (result?.ok === false) throw new Error(result.message || '游戏未能启动。');
      toast(result?.tracking === false ? '游戏已启动；此启动方式不自动统计时长。' : '游戏已启动，祝你度过一段好时光。');
      const next = await API.getState();
      applyState(next);
      if ($('#detail-dialog').open && detailGameId === id) openGameDetail(id);
    });
  }

  async function changeGameStatus(id, status, target) {
    const epoch = accountEpoch;
    await busy(target, async () => {
      const next = await API.setGameStatus({ id, status });
      if (epoch !== accountEpoch) return;
      applyState(next);
      if ($('#detail-dialog').open && detailGameId === id) openGameDetail(id);
      toast(status === 'finished' ? '已添加通关标签，可在“已通关”中查看。' : `游玩状态已改为“${statuses[status]}”。`);
    });
  }

  function openGameDetail(id) {
    const game = state.games.find(item => item.id === id);
    if (!game) return;
    detailGameId = id;
    const dialog = $('#detail-dialog');
    const side = h('div', {}, h('div', { class: 'detail-cover' }, ...coverContents(game)), button('启动游戏', event => launch(game.id, event.currentTarget), 'button primary wide', 'play'), h('div', { class: 'detail-side-actions' }, button('游戏目录', event => busy(event.currentTarget, () => API.openGameFolder(game.id)), 'button subtle', 'folder'), button(game.favorite ? '已收藏' : '收藏', event => busy(event.currentTarget, async () => { applyState(await API.saveGame({ ...game, favorite: !game.favorite })); openGameDetail(game.id); }), 'button subtle', 'heart')));
    const completion = button(game.status === 'finished' ? '取消通关标记' : '标记为已通关', event => changeGameStatus(id, game.status === 'finished' ? 'unplayed' : 'finished', event.currentTarget), 'button subtle wide detail-completed-toggle', 'check');
    completion.id = 'detail-completed-toggle';
    completion.setAttribute('aria-pressed', String(game.status === 'finished'));
    const statusSelect = h('select', { id: 'detail-status-select', class: 'text-input', onchange: event => changeGameStatus(id, event.currentTarget.value, event.currentTarget) }, ...Object.entries(statuses).map(([value, label]) => h('option', { value }, label)));
    statusSelect.value = game.status;
    side.append(completion, field('游玩状态 · 修改即保存', statusSelect));
    const main = h('div', { class: 'detail-main' }, h('div', { class: 'eyebrow' }, 'YOUR STORY'), h('h2', { id: 'detail-title' }, game.title), game.originalTitle ? h('p', { class: 'original-title' }, game.originalTitle) : null, h('p', { class: 'detail-developer' }, icon('book'), game.developer || '未填写制作组'), h('div', { class: 'detail-tags' }, h('span', { class: 'tag' }, statuses[game.status] || statuses.unplayed), categoriesFor(game).map(category => h('span', { class: 'tag' }, category.name)), game.launchMode === 'locale' ? h('span', { class: 'tag' }, '转区启动') : null), h('div', { class: 'detail-metrics' }, h('div', { class: 'detail-metric' }, h('label', {}, '累计游玩'), h('strong', {}, duration(seconds(game)))), h('div', { class: 'detail-metric' }, h('label', {}, '上次游玩'), h('strong', {}, shortDate(game.lastPlayed)))), h('div', { class: 'detail-info' }, h('h3', {}, '我的笔记'), h('p', {}, game.notes || '还没有留下笔记。可以在编辑中记录你的游玩感受。')), h('div', { class: 'detail-info' }, h('h3', {}, '启动位置'), h('p', { class: 'detail-path' }, game.exePath || '尚未指定，启动时选择游戏程序。')));
    openDialog(dialog, [h('div', { class: 'modal-header detail-header' }, iconButton('close', '关闭游戏详情', () => dialog.close())), h('div', { class: 'detail-layout' }, side, main), h('div', { class: 'detail-bottom' }, h('span', {}, game.addedAt ? `收录于 ${shortDate(game.addedAt)}` : '收录在你的游戏库'), h('div', { class: 'topbar-actions' }, button('从库中移除', () => removeGame(game), 'button ghost', 'trash'), button('编辑游戏', () => openGameEditor(game.id), 'button subtle', 'edit')))]);
  }

  function confirmAction(title, description, confirmLabel, action) {
    const dialog = $('#confirm-dialog');
    const error = h('div', { class: 'inline-error', role: 'alert' });
    const confirm = button(confirmLabel, async () => {
      if (confirm.disabled) return;
      confirm.disabled = true;
      setError(error, null);
      try { await action(); dialog.close(); }
      catch (err) { setError(error, err); }
      finally { confirm.disabled = false; }
    }, 'button danger');
    const cancel = button('取消', () => dialog.close(), 'button subtle');
    openDialog(dialog, [dialogHeader(title, '', 'confirm-title', dialog), h('div', { class: 'confirm-body' }, error, h('p', {}, description)), h('div', { class: 'modal-footer' }, cancel, confirm)]);
    cancel.focus();
  }

  function removeGame(game) {
    confirmAction('从游戏库移除？', `将移除「${game.title}」的资料和本启动器中的游玩记录。\n游戏文件和存档会保留在原位置。`, '从库中移除', async () => {
      applyState(await API.deleteGame(game.id));
      $('#detail-dialog').close();
      toast('已从游戏库移除，游戏文件仍保留。');
    });
  }

  function openCategoryEditor(category) {
    const dialog = $('#category-dialog');
    let color = category?.color || palettes[0].value;
    const name = h('input', { id: 'category-name', class: 'text-input', type: 'text', value: category?.name || '', required: true, maxlength: 40, placeholder: '例如：猎奇、拔作、纯爱…', autocomplete: 'off' });
    const error = h('div', { class: 'inline-error', role: 'alert' });
    const colors = h('div', { class: 'color-options', role: 'group', 'aria-label': '分类颜色' });
    for (const option of palettes) colors.append(h('button', { type: 'button', class: `color-option ${option.className}${color.toLowerCase() === option.value ? ' selected' : ''}`, title: option.name, 'aria-label': option.name, 'aria-pressed': String(color.toLowerCase() === option.value), onclick: () => {
      color = option.value;
      for (const item of colors.children) { const selected = item.title === option.name; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); }
    } }));
    const save = h('button', { type: 'submit', class: 'button primary' }, category ? '保存分类' : '创建分类');
    const form = h('form', {}, dialogHeader(category ? '编辑分类' : '新建分类', '用你自己的方式整理故事。', 'category-dialog-title', dialog), h('div', { class: 'modal-body' }, error, h('div', { class: 'form-grid' }, field('分类名称', name, { full: true, required: true }), field('分类颜色', colors, { full: true }))), h('div', { class: 'modal-footer' }, button('取消', () => dialog.close(), 'button subtle'), save));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (save.disabled || !form.reportValidity()) return;
      save.disabled = true;
      setError(error, null);
      try {
        applyState(await API.saveCategory({ ...(category || {}), name: name.value.trim(), color }));
        dialog.close();
        toast(category ? '分类已更新。' : '新分类已创建。');
      } catch (err) { setError(error, err); }
      finally { save.disabled = false; }
    });
    openDialog(dialog, form);
  }

  function removeCategory(category) {
    const count = state.games.filter(game => (game.categories || []).includes(category.id)).length;
    confirmAction('删除这个分类？', `将删除「${category.name}」分类${count ? `，并从 ${count} 款游戏中移除这个标签` : ''}。\n游戏资料、其他分类和本机文件会保留。`, '删除分类', async () => { applyState(await API.deleteCategory(category.id)); toast('分类已删除。'); });
  }

  function openSettings() {
    if (!ready) return;
    const dialog = $('#settings-dialog');
    const row = (title, description, action) => h('div', { class: 'setting-row' }, h('div', {}, h('h3', {}, title), h('p', {}, description)), action);
    const body = h('div', { class: 'modal-body' },
      row('本地账户', state.account?.user ? `当前登录：${state.account.user.displayId}。账户与游戏库仅保存在本机。` : '当前使用访客游戏库，也可创建本地账户分开管理收藏。', button('管理账户', () => { dialog.close(); navigate('account'); }, 'button subtle small', 'user')),
      row('导出资料备份', '保存资料、封面与分类。游戏本体和存档需另行备份。', button('导出备份', event => busy(event.currentTarget, async () => { const result = await API.exportBackup(); if (result) toast('备份已导出。'); }), 'button subtle small', 'export')),
      row('导入资料备份', '将备份中的游戏资料合并到当前游戏库。', button('导入备份', event => busy(event.currentTarget, async () => { const result = await API.importBackup(); if (!result || result.canceled) return; applyState(result.state); toast(`备份导入完成：新增 ${result.added || 0} 款，跳过 ${result.skipped || 0} 款。`); openSettings(); }), 'button subtle small', 'import')),
      row('Locale Emulator', state.settings.localeEmulatorPath ? '已指定转区工具，可在每款游戏中单独启用。' : '为需要日语区域设置的游戏指定 LEProc.exe。', button(state.settings.localeEmulatorPath ? '重新选择' : '选择程序', event => busy(event.currentTarget, async () => { const result = await API.pickFile({ kind: 'game' }); if (!result) return; applyState(await API.saveSettings({ localeEmulatorPath: result })); openSettings(); toast('转区工具已保存。'); }), 'button subtle small', 'folder')),
      row('本地数据目录', '查看游戏库数据与本地封面。', button('打开目录', event => busy(event.currentTarget, () => API.openDataFolder()), 'button subtle small', 'folder')),
      h('div', { class: 'setting-path' }, h('strong', {}, '数据保存在'), state.dataDir || '本机应用数据目录'),
      state.settings.localeEmulatorPath ? h('div', { class: 'setting-path' }, h('strong', {}, 'Locale Emulator'), state.settings.localeEmulatorPath) : null,
    );
    openDialog(dialog, [dialogHeader('设置与备份', '让你的收藏长久留在身边。', 'settings-title', dialog), body, h('div', { class: 'settings-footer' }, 'galshelf · 本地游戏启动器')]);
  }

  async function initialize() {
    $('#add-game-button').disabled = true;
    $('#folder-add-button').disabled = true;
    try {
      if (!API) throw new Error('未连接本地服务，请使用 galshelf 应用打开。');
      const next = await API.getState();
      ready = true;
      applyState(next);
      $('#add-game-button').disabled = false;
      $('#folder-add-button').disabled = false;
    } catch (error) {
      $('#page-content').setAttribute('aria-busy', 'false');
      $('#page-content').replaceChildren(emptyState('游戏库暂时未能打开', errorText(error), 'info', [button('重试', () => initialize(), 'button primary')]));
    }
  }

  $('#settings-button').append(icon('settings'));
  $('#settings-button').addEventListener('click', openSettings);
  $('#add-game-button').addEventListener('click', () => { if (ready) openGameEditor(); });
  $('#folder-add-button').addEventListener('click', event => addFromFolder(event.currentTarget));
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !document.querySelector('dialog[open]')) {
      const search = $('.search-box input');
      if (search) { event.preventDefault(); search.focus(); search.select(); }
    }
  });
  if (API && typeof API.onStateChanged === 'function') API.onStateChanged(next => {
    if (!ready) return;
    if (next && Array.isArray(next.games)) applyState(next);
    else API.getState().then(applyState).catch(error => toast(errorText(error), true));
  });
  window.addEventListener('focus', () => {
    if (!ready || !API || document.querySelector('#editor-dialog[open], #category-dialog[open], #confirm-dialog[open]')) return;
    API.getState().then(next => {
      if (JSON.stringify(next) !== JSON.stringify(state)) {
        applyState(next);
        if ($('#detail-dialog').open && detailGameId) openGameDetail(detailGameId);
      }
    }).catch(() => {});
  });
  initialize();
})();
