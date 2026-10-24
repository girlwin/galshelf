'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, DEFAULT_CATEGORIES, SITES, safeLocalPath, validateGame } = require('../lib/store');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S0AAAAASUVORK5CYII=', 'base64');
const LOCALE_GUID = '44e156d4-e4d6-45f0-89a3-15f46948b8ab';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'galshelf-store-'));
  t.after(() => {
    const target = path.resolve(root);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.match(path.basename(target), /^galshelf-store-/);
    fs.rmSync(target, { recursive: true, force: true });
  });
  return {
    root,
    store: name => new Store(path.join(root, name)),
    exe: name => path.join(root, 'games', name + '.exe'),
    json(name, value) {
      const file = path.join(root, name + '.json');
      fs.writeFileSync(file, JSON.stringify(value), 'utf8');
      return file;
    }
  };
}

function backup(games, categories = DEFAULT_CATEGORIES, covers = {}) {
  return { schemaVersion: 1, format: 'galshelf-backup', games, categories, covers };
}

function addGame(store, raw) {
  store.saveGame(raw);
  return store.state().games.at(-1);
}

test('new libraries contain the requested independent categories and persist games with multiple categories', t => {
  const f = fixture(t);
  const store = f.store('library');
  assert.ok(store.state().categories.some(c => c.id === 'grotesque' && c.name === '猎奇'));
  assert.ok(store.state().categories.some(c => c.id === 'nukige' && c.name === '拔作'));
  const game = addGame(store, {
    title: '  星海物语  ', exePath: f.exe('story'),
    categories: ['story', 'grotesque', 'nukige', 'story', 'unknown', null]
  });
  assert.equal(game.title, '星海物语');
  assert.deepEqual(game.categories, ['story', 'grotesque', 'nukige']);
  assert.deepEqual(f.store('library').state().games[0].categories, game.categories);
});

test('renaming and removing a category preserve games, their other categories, and their identities', t => {
  const f = fixture(t);
  const store = f.store('library');
  const game = addGame(store, { title: '分类测试', exePath: f.exe('one'), categories: ['grotesque', 'mystery'] });
  store.saveCategory({ id: 'grotesque', name: '猎奇作品', color: '#aabbcc' });
  assert.equal(store.state().categories.find(c => c.id === 'grotesque').name, '猎奇作品');
  assert.deepEqual(store.state().games[0].categories, ['grotesque', 'mystery']);
  store.deleteCategory('grotesque');
  const reopened = f.store('library').state();
  assert.equal(reopened.games.length, 1);
  assert.equal(reopened.games[0].id, game.id);
  assert.equal(reopened.games[0].exePath, game.exePath);
  assert.deepEqual(reopened.games[0].categories, ['mystery']);
  assert.ok(!reopened.categories.some(c => c.id === 'grotesque'));
});

test('duplicate category names are rejected without changing the stored category', t => {
  const f = fixture(t);
  const store = f.store('library');
  store.saveCategory({ name: 'My Collection', color: '#123456' });
  const before = fs.readFileSync(store.file, 'utf8');
  assert.throws(() => store.saveCategory({ name: 'my collection' }), /同名分类/);
  assert.throws(() => store.saveCategory({ id: 'story', name: 'My Collection' }), /同名分类/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
});

test('editing a launched game preserves its identity, play history and locale configuration', t => {
  const f = fixture(t);
  const store = f.store('library');
  const game = addGame(store, {
    title: '转区游戏', exePath: f.exe('locale'), args: ['--windowed', '含 空格的参数'],
    launchMode: 'locale', localeGuid: LOCALE_GUID
  });
  store.markLaunch(game.id);
  store.addPlayTime(game.id, 87);
  const launched = store.state().games[0];
  store.saveGame({ ...launched, title: '重命名后的游戏', notes: '保留启动设置' });
  const edited = f.store('library').state().games[0];
  assert.equal(edited.id, game.id);
  assert.equal(edited.addedAt, game.addedAt);
  assert.equal(edited.lastPlayed, launched.lastPlayed);
  assert.equal(edited.playSeconds, 87);
  assert.equal(edited.status, 'playing');
  assert.equal(edited.launchMode, 'locale');
  assert.equal(edited.localeGuid, LOCALE_GUID);
  assert.deepEqual(edited.args, ['--windowed', '含 空格的参数']);
});

test('returned state is a detached snapshot and cannot silently mutate stored games', t => {
  const f = fixture(t);
  const store = f.store('library');
  addGame(store, { title: '快照测试', exePath: f.exe('snapshot'), categories: ['story'], args: ['--windowed'] });
  const state = store.state();
  state.games[0].categories.push('nukige');
  state.games[0].args.push('--mutated');
  state.games[0].title = 'Changed';
  state.categories[0].name = 'Changed';
  const fresh = store.state();
  assert.deepEqual(fresh.games[0].categories, ['story']);
  assert.deepEqual(fresh.games[0].args, ['--windowed']);
  assert.equal(fresh.games[0].title, '快照测试');
  assert.equal(fresh.categories[0].name, '剧情');
});

test('backup import merges by category name, deduplicates identities and title-path pairs, and preserves local games and settings', t => {
  const f = fixture(t);
  const store = f.store('destination');
  const existing = addGame(store, { title: '已有游戏', exePath: f.exe('same'), notes: '本地备注', categories: ['story'], favorite: true });
  store.saveSettings({ legacyRoot: path.join(f.root, 'my-original-library') });
  const settingsBefore = store.state().settings;
  const incoming = backup([
    { id: existing.id, title: '不应覆盖原游戏', exePath: f.exe('SAME'), notes: '外来备注', categories: ['old-story'] },
    { title: '新增游戏', exePath: f.exe('new'), categories: ['old-story', 'old-custom'], launchMode: 'locale', localeGuid: LOCALE_GUID },
    { title: '新增游戏', exePath: f.exe('NEW'), categories: ['old-custom'] },
    { title: '共用启动程序的另一部作品', exePath: f.exe('same'), categories: ['old-custom'] }
  ], [
    { id: 'old-story', name: '剧情', color: '#ffffff' },
    { id: 'old-custom', name: '自定义收藏', color: '#123456' }
  ]);
  incoming.settings = { legacyRoot: path.join(f.root, 'external-library') };
  const file = f.json('merge', incoming);
  const result = store.importBackup(file);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.state.games.length, 3);
  assert.deepEqual(result.state.games.find(g => g.id === existing.id), existing);
  assert.deepEqual(result.state.settings, settingsBefore);
  assert.equal(result.state.categories.filter(c => c.name === '剧情').length, 1);
  const custom = result.state.categories.find(c => c.name === '自定义收藏');
  const added = result.state.games.find(g => g.title === '新增游戏');
  assert.deepEqual(added.categories, ['story', custom.id]);
  assert.equal(added.launchMode, 'locale');
  assert.equal(added.localeGuid, LOCALE_GUID);
  assert.ok(result.state.games.some(g => g.title === '共用启动程序的另一部作品' && g.exePath === existing.exePath));
  const again = store.importBackup(file);
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 4);
  assert.equal(f.store('destination').state().games.length, 3);
});

test('backup roundtrip preserves two distinct game identities that share one executable', t => {
  const f = fixture(t);
  const source = f.store('source');
  const first = addGame(source, { title: '本篇', exePath: f.exe('shared'), args: ['--main'], categories: ['story'] });
  const second = addGame(source, { title: '后日谈', exePath: f.exe('shared'), args: ['--after'], categories: ['romance'] });
  const file = path.join(f.root, 'shared-launcher.json');
  source.exportBackup(file);
  const destination = f.store('destination');
  const result = destination.importBackup(file);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.state.games.map(g => [g.id, g.title, g.exePath, g.args]), [
    [first.id, '本篇', first.exePath, ['--main']],
    [second.id, '后日谈', second.exePath, ['--after']]
  ]);
  const repeated = destination.importBackup(file);
  assert.equal(repeated.added, 0);
  assert.equal(repeated.skipped, 2);
  assert.equal(f.store('destination').state().games.length, 2);
});

test('title-only wishlist entries deduplicate on repeated imports', t => {
  const f = fixture(t);
  const store = f.store('library');
  addGame(store, { title: '愿望单作品', categories: ['romance'] });
  const file = f.json('wishlist', backup([
    { title: '愿望单作品', categories: ['story'] },
    { title: '另一个愿望单作品', categories: ['story'] }
  ]));
  assert.equal(store.importBackup(file).added, 1);
  assert.equal(store.importBackup(file).added, 0);
  assert.equal(store.state().games.length, 2);
});

test('backup export and import preserve cover bytes and play metadata without depending on the original files', t => {
  const f = fixture(t);
  const source = f.store('source');
  const sourceImage = path.join(f.root, 'cover.png');
  fs.writeFileSync(sourceImage, PNG);
  const game = addGame(source, {
    title: '带封面的作品', exePath: f.exe('covered'), coverPath: sourceImage,
    categories: ['healing', 'romance'], notes: '原始备注', launchMode: 'locale', localeGuid: LOCALE_GUID
  });
  source.markLaunch(game.id);
  source.addPlayTime(game.id, 135);
  const backupFile = path.join(f.root, 'roundtrip.json');
  source.exportBackup(backupFile);
  const exported = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  assert.equal(exported.format, 'galshelf-backup');
  assert.deepEqual(Buffer.from(exported.covers[game.coverPath], 'base64'), PNG);
  fs.unlinkSync(sourceImage);
  fs.unlinkSync(path.join(source.dir, game.coverPath));
  const destination = f.store('restored');
  const result = destination.importBackup(backupFile);
  assert.equal(result.added, 1);
  const restored = f.store('restored').state().games[0];
  assert.equal(restored.id, game.id);
  assert.equal(restored.title, game.title);
  assert.equal(restored.notes, '原始备注');
  assert.equal(restored.playSeconds, 135);
  assert.equal(restored.lastPlayed, source.state().games[0].lastPlayed);
  assert.equal(restored.addedAt, game.addedAt);
  assert.equal(restored.launchMode, 'locale');
  assert.equal(restored.localeGuid, LOCALE_GUID);
  assert.deepEqual(restored.categories, ['healing', 'romance']);
  assert.match(restored.coverUrl, /^file:\/\//);
  assert.deepEqual(fs.readFileSync(path.join(destination.dir, restored.coverPath)), PNG);
});

test('invalid backup cover traversal rejects the entire import without changing the existing library', t => {
  const f = fixture(t);
  const store = f.store('library');
  addGame(store, { title: '已有作品', exePath: f.exe('existing') });
  const before = fs.readFileSync(store.file, 'utf8');
  const stateBefore = store.state();
  const malicious = backup([
    { title: '本应随失败一起撤回', exePath: f.exe('valid') },
    { title: '非法封面', exePath: f.exe('bad'), coverPath: '../escaped.png' }
  ], [{ id: 'uncommitted', name: '不可残留分类', color: '#123456' }], {
    '../escaped.png': PNG.toString('base64')
  });
  assert.throws(() => store.importBackup(f.json('malicious-cover', malicious)), /封面路径无效/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  assert.deepEqual(store.state(), stateBefore);
  assert.ok(!fs.existsSync(path.join(f.root, 'escaped.png')));
  assert.deepEqual(fs.readdirSync(store.coverDir), []);
});

test('invalid later game in a backup does not leave earlier games or categories partially imported', t => {
  const f = fixture(t);
  const store = f.store('library');
  const before = fs.readFileSync(store.file, 'utf8');
  const stateBefore = store.state();
  const file = f.json('invalid-game', backup([
    { title: '有效游戏', exePath: f.exe('valid') },
    { title: '非法游戏', exePath: '..\\relative.exe' }
  ], [{ id: 'new', name: '导入分类', color: '#123456' }]));
  assert.throws(() => store.importBackup(file), /本机的绝对路径/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  assert.deepEqual(store.state(), stateBefore);
});

test('unrelated JSON files are rejected as backups without erasing saved games', t => {
  const f = fixture(t);
  const store = f.store('library');
  const game = addGame(store, { title: '保留作品', exePath: f.exe('saved') });
  for (const data of [[], {}, { schemaVersion: 99, format: 'galshelf-backup', games: [], categories: [] }]) {
    assert.throws(() => store.importBackup(f.json('unrelated', data)), /galshelf 导出的 JSON 备份/);
  }
  assert.equal(store.state().games[0].id, game.id);
});

test('local launch paths reject relative paths, URLs, UNC shares, device paths and embedded NUL', () => {
  for (const value of [
    'game.exe', '..\\game.exe', 'https://example.com/game.exe', 'file:///C:/game.exe',
    '\\\\server\\share\\game.exe', '//server/share/game.exe', '\\\\?\\C:\\game.exe',
    'C:\\Games\\bad\0.exe'
  ]) {
    assert.throws(() => safeLocalPath(value, '启动文件', ['.exe']), /本机的绝对路径/);
  }
  assert.throws(() => safeLocalPath('C:\\Games\\script.ps1', '启动文件', ['.exe']), /格式不受支持/);
  assert.equal(safeLocalPath('C:\\Games\\中文游戏\\game.exe', '启动文件', ['.exe']), path.normalize('C:\\Games\\中文游戏\\game.exe'));
});

test('invalid argument representations are rejected before writing a game', t => {
  const f = fixture(t);
  const store = f.store('library');
  const before = fs.readFileSync(store.file, 'utf8');
  for (const args of ['--fullscreen', {}, [123], ['abc\0def'], ['x'.repeat(8193)], Array(101).fill('x')]) {
    assert.throws(() => store.saveGame({ title: '参数测试', exePath: f.exe('args'), args }), /启动参数格式不正确/);
  }
  assert.equal(store.state().games.length, 0);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  const game = validateGame({ title: '合法参数', exePath: f.exe('args'), args: ['中文 参数', '--name=A&B', ''] }, DEFAULT_CATEGORIES);
  assert.deepEqual(game.args, ['中文 参数', '--name=A&B', '']);
});

test('malformed library files give an explicit recovery error and preserve both original and backup bytes', t => {
  const f = fixture(t);
  const store = f.store('broken');
  const backupFile = store.file + '.bak';
  const backupBytes = '{"recovery":"must be preserved"}';
  fs.writeFileSync(backupFile, backupBytes, 'utf8');
  for (const corrupt of [
    '{not valid JSON',
    JSON.stringify({ schemaVersion: 2, games: [], categories: [] }),
    JSON.stringify({ schemaVersion: 1, games: [null], categories: [], settings: {} }),
    JSON.stringify({ schemaVersion: 1, games: [], categories: [null], settings: {} })
  ]) {
    fs.writeFileSync(store.file, corrupt, 'utf8');
    assert.throws(() => f.store('broken'), error => {
      assert.match(error.message, /游戏库文件无法读取/);
      assert.match(error.message, /library\.json\.bak/);
      return true;
    });
    assert.equal(fs.readFileSync(store.file, 'utf8'), corrupt);
    assert.equal(fs.readFileSync(backupFile, 'utf8'), backupBytes);
  }
});

test('each successful write keeps the immediately preceding library revision as a recovery backup', t => {
  const f = fixture(t);
  const store = f.store('library');
  addGame(store, { title: '第一部', exePath: f.exe('one') });
  const previous = fs.readFileSync(store.file, 'utf8');
  addGame(store, { title: '第二部', exePath: f.exe('two') });
  assert.equal(fs.readFileSync(store.file + '.bak', 'utf8'), previous);
  assert.equal(f.store('library').state().games.length, 2);
});

test('site search templates preserve Chinese, spaces and reserved URL characters as one search term', () => {
  const query = '星海 物语 & A/B? #中文';
  const expectedHosts = { vndb: 'vndb.org', bangumi: 'bgm.tv', gog: 'www.gog.com', itch: 'itch.io' };
  const params = { vndb: 'q', gog: 'query', itch: 'q' };
  const searchable=SITES.filter(site=>site.searchTemplate);
  assert.deepEqual(new Set(searchable.map(s => s.id)), new Set(Object.keys(expectedHosts)));
  for (const site of searchable) {
    assert.equal(site.searchTemplate.match(/\{query\}/g)?.length, 1, site.id);
    const url = new URL(site.searchTemplate.replace('{query}', encodeURIComponent(query)));
    assert.equal(url.protocol, 'https:', site.id);
    assert.equal(url.hostname, expectedHosts[site.id], site.id);
    assert.equal(url.hash, '', site.id);
    if (site.id === 'bangumi') {
      assert.equal(decodeURIComponent(url.pathname.slice('/subject_search/'.length)), query);
      assert.equal(url.searchParams.get('cat'), '4');
    } else {
      assert.equal(url.searchParams.get(params[site.id]), query, site.id);
    }
    if (site.id === 'itch') assert.equal(url.searchParams.get('type'), 'games');
  }
});
