'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { Accounts } = require('../lib/accounts');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S0AAAAASUVORK5CYII=', 'base64');
const SECRET = 'synthetic password 123!';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'galshelf-accounts-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^galshelf-accounts-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, file: path.join(root, 'accounts.json'), accounts: new Accounts(root) };
}

test('new local account store starts empty and as a guest', t => {
  const f = fixture(t);
  assert.deepEqual(f.accounts.state(), { mode: 'local', user: null });
  assert.equal(f.accounts.libraryDir(), f.root);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), { schemaVersion: 1, accounts: [] });
  assert.throws(() => f.accounts.updateProfile({ displayId: 'test' }), /请先登录/);
});

test('registration hashes passwords with different random salts and returns only public identity', async t => {
  const f = fixture(t);
  const one = await f.accounts.register({ loginName: 'Reader_01', password: SECRET, displayId: '本地玩家' });
  assert.equal(one.user.loginName, 'Reader_01');
  assert.equal(one.user.displayId, '本地玩家');
  assert.equal(one.user.avatarUrl, '');
  assert.deepEqual(Object.keys(one.user).sort(), ['avatarUrl', 'displayId', 'id', 'loginName']);
  const two = await f.accounts.register({ loginName: 'Reader_02', password: SECRET });
  assert.notEqual(one.user.id, two.user.id);
  const serialized = fs.readFileSync(f.file, 'utf8');
  const records = JSON.parse(serialized).accounts;
  assert.ok(!serialized.includes(SECRET));
  assert.ok(!fs.readFileSync(f.file + '.bak', 'utf8').includes(SECRET));
  assert.notEqual(records[0].password.salt, records[1].password.salt);
  assert.notEqual(records[0].password.hash, records[1].password.hash);
  for (const record of records) {
    assert.match(record.password.salt, /^[a-f0-9]{64}$/);
    assert.match(record.password.hash, /^[a-f0-9]{128}$/);
    assert.ok(!JSON.stringify(one).includes(record.password.salt));
    assert.ok(!JSON.stringify(two).includes(record.password.hash));
  }
});

test('login is case insensitive, rejects wrong passwords, and restarts logged out', async t => {
  const f = fixture(t);
  const created = await f.accounts.register({ loginName: 'Reader_One', password: SECRET });
  assert.deepEqual(f.accounts.logout(), { mode: 'local', user: null });
  await assert.rejects(f.accounts.login({ loginName: 'reader_one', password: 'incorrect secret' }), /登录名或密码不正确/);
  assert.equal(f.accounts.state().user, null);
  await assert.rejects(f.accounts.login({ loginName: 'MissingUser', password: SECRET }), /登录名或密码不正确/);
  const loggedIn = await f.accounts.login({ loginName: 'READER_ONE', password: SECRET });
  assert.equal(loggedIn.user.id, created.user.id);
  assert.equal(new Accounts(f.root).state().user, null);
});

test('login names, display IDs, passwords, and case-insensitive duplicates are validated', async t => {
  const f = fixture(t);
  await f.accounts.register({ loginName: 'Valid-Name', password: SECRET, displayId: '玩家 ID' });
  await assert.rejects(f.accounts.register({ loginName: 'valid-name', password: SECRET }), /已存在/);
  for (const invalid of ['ab', 'with space', '../bad', '中文名', 'a'.repeat(33)]) {
    await assert.rejects(f.accounts.register({ loginName: invalid, password: SECRET }), /登录名/);
  }
  for (const invalid of ['', 'short', 'a'.repeat(129)]) {
    await assert.rejects(f.accounts.register({ loginName: 'Another', password: invalid }), /密码/);
  }
  for (const invalid of ['', ' ', 'a'.repeat(33), 'line\nbreak']) {
    await assert.rejects(f.accounts.register({ loginName: 'Another', password: SECRET, displayId: invalid }), /显示 ID/);
  }
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).accounts.length, 1);
});

test('different local accounts and the guest have distinct stable library directories', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'library.json'), 'synthetic guest library');
  const alice = await f.accounts.register({ loginName: 'Alice', password: SECRET });
  const aliceDir = f.accounts.libraryDir();
  assert.equal(aliceDir, path.join(f.root, 'profiles', alice.user.id));
  fs.mkdirSync(aliceDir, { recursive: true });
  fs.writeFileSync(path.join(aliceDir, 'library.json'), 'synthetic Alice library');
  const bob = await f.accounts.register({ loginName: 'Bob', password: SECRET });
  const bobDir = f.accounts.libraryDir();
  assert.equal(bobDir, path.join(f.root, 'profiles', bob.user.id));
  assert.notEqual(aliceDir, bobDir);
  assert.ok(!fs.existsSync(path.join(bobDir, 'library.json')));
  const modified = f.accounts.updateProfile({ displayId: '新的昵称' });
  assert.equal(modified.user.id, bob.user.id);
  assert.equal(modified.user.loginName, 'Bob');
  assert.equal(f.accounts.libraryDir(), bobDir);
  await f.accounts.login({ loginName: 'Alice', password: SECRET });
  assert.equal(f.accounts.libraryDir(), aliceDir);
  assert.equal(fs.readFileSync(path.join(aliceDir, 'library.json'), 'utf8'), 'synthetic Alice library');
  f.accounts.logout();
  assert.equal(f.accounts.libraryDir(), f.root);
  assert.equal(fs.readFileSync(path.join(f.root, 'library.json'), 'utf8'), 'synthetic guest library');
});

test('avatars are copied from normalized PNG bytes, persist across login, and can be cleared', async t => {
  const f = fixture(t);
  const created = await f.accounts.register({ loginName: 'Picture', password: SECRET });
  const updated = f.accounts.updateProfile({ displayId: '头像测试', avatarPng: PNG });
  assert.match(updated.user.avatarUrl, /^file:/);
  const avatarFile = fileURLToPath(updated.user.avatarUrl);
  assert.equal(path.dirname(avatarFile), path.join(f.root, 'avatars'));
  assert.match(path.basename(avatarFile), /^[a-f0-9]{64}\.png$/);
  assert.deepEqual(fs.readFileSync(avatarFile), PNG);
  assert.equal(updated.user.id, created.user.id);
  assert.equal(f.accounts.updateProfile({ displayId: '保留头像' }).user.avatarUrl, updated.user.avatarUrl);
  const reopened = new Accounts(f.root);
  assert.equal((await reopened.login({ loginName: 'Picture', password: SECRET })).user.avatarUrl, updated.user.avatarUrl);
  for (const invalid of ['source.png', Buffer.from('invalid'), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
    assert.throws(() => reopened.updateProfile({ avatarPng: invalid }), /PNG/);
  }
  assert.equal(reopened.updateProfile({ avatarPng: null }).user.avatarUrl, '');
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).accounts[0].avatar, null);
  assert.ok(!fs.readFileSync(f.file, 'utf8').includes(f.root));
});

test('five failed login attempts impose a thirty-second in-memory cooldown', async t => {
  const f = fixture(t);
  await f.accounts.register({ loginName: 'Cooldown', password: SECRET });
  f.accounts.logout();
  for (let attempt = 0; attempt < 4; attempt++) {
    await assert.rejects(f.accounts.login({ loginName: 'Cooldown', password: 'incorrect secret' }), /登录名或密码不正确/);
  }
  await assert.rejects(f.accounts.login({ loginName: 'Cooldown', password: 'incorrect secret' }), /30 秒/);
  await assert.rejects(f.accounts.login({ loginName: 'Cooldown', password: SECRET }), /30 秒/);
  assert.equal(f.accounts.state().user, null);
  const realNow = Date.now;
  const afterCooldown = realNow() + 31000;
  Date.now = () => afterCooldown;
  try {
    assert.equal((await f.accounts.login({ loginName: 'Cooldown', password: SECRET })).user.loginName, 'Cooldown');
  } finally { Date.now = realNow; }
});

test('corrupt or incompatible account files are preserved without replacing their backup', async t => {
  const f = fixture(t);
  await f.accounts.register({ loginName: 'Preserve', password: SECRET });
  const valid = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  const backup = fs.readFileSync(f.file + '.bak', 'utf8');
  const fixtures = [
    '{malformed',
    JSON.stringify({ schemaVersion: 2, accounts: [] }),
    JSON.stringify({ ...valid, extra: true }),
    JSON.stringify({ ...valid, accounts: [...valid.accounts, valid.accounts[0]] }),
    JSON.stringify({ ...valid, accounts: [{ ...valid.accounts[0], avatar: '../outside.png' }] }),
    JSON.stringify({ ...valid, accounts: [{ ...valid.accounts[0], password: { ...valid.accounts[0].password, hash: 'bad' } }] })
  ];
  for (const invalid of fixtures) {
    fs.writeFileSync(f.file, invalid, 'utf8');
    assert.throws(() => new Accounts(f.root), /账户文件无法读取/);
    assert.equal(fs.readFileSync(f.file, 'utf8'), invalid);
    assert.equal(fs.readFileSync(f.file + '.bak', 'utf8'), backup);
  }
  assert.throws(() => f.accounts.updateProfile({ displayId: '不能覆盖' }), /账户文件无法读取/);
  assert.equal(fs.readFileSync(f.file, 'utf8'), fixtures.at(-1));
});

test('logout cancels an in-flight login and simultaneous authentication is rejected', async t => {
  const f = fixture(t);
  await f.accounts.register({ loginName: 'Concurrent', password: SECRET });
  f.accounts.logout();
  const pending = f.accounts.login({ loginName: 'Concurrent', password: SECRET });
  await assert.rejects(f.accounts.login({ loginName: 'Concurrent', password: SECRET }), /正在处理/);
  f.accounts.logout();
  await assert.rejects(pending, /已取消/);
  assert.equal(f.accounts.state().user, null);
});

test('internal session recovery supports only known IDs and a guest', async t => {
  const f = fixture(t);
  const first = await f.accounts.register({ loginName: 'First', password: SECRET });
  await f.accounts.register({ loginName: 'Second', password: SECRET });
  const restored = f.accounts.restoreSession(first.user.id);
  assert.equal(restored.user.id, first.user.id);
  assert.equal(f.accounts.libraryDir(), path.join(f.root, 'profiles', first.user.id));
  assert.throws(() => f.accounts.restoreSession('unknown'), /不存在/);
  assert.equal(f.accounts.state().user.id, first.user.id);
  assert.deepEqual(f.accounts.restoreSession(null), { mode: 'local', user: null });
});
