'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');

const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_ACCOUNT_FILE_BYTES = 10 * 1024 * 1024;
const DATA_ERROR = '账户文件无法读取或已被其他程序修改。请保留 accounts.json，并检查 accounts.json.bak，避免覆盖已有数据。';

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function loginName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{3,32}$/.test(value.trim())) {
    throw new Error('登录名须为 3–32 位英文字母、数字、下划线或短横线。');
  }
  return value.trim();
}

function displayId(value) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > 32 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('显示 ID 须为 1–32 个字符，不能包含换行或控制字符。');
  }
  return value.trim();
}

function password(value) {
  if (typeof value !== 'string' || [...value].length < 8 || [...value].length > 128 || value.includes('\0')) {
    throw new Error('密码须为 8–128 个字符。');
  }
  return value;
}

function validData(data) {
  if (!exactKeys(data, ['schemaVersion', 'accounts']) || data.schemaVersion !== 1 || !Array.isArray(data.accounts) || data.accounts.length > 10000) return false;
  const names = new Set();
  const ids = new Set();
  for (const user of data.accounts) {
    if (!exactKeys(user, ['id', 'loginName', 'displayId', 'password', 'avatar'])) return false;
    if (typeof user.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(user.id) || ids.has(user.id)) return false;
    try {
      if (loginName(user.loginName) !== user.loginName || displayId(user.displayId) !== user.displayId) return false;
    } catch { return false; }
    const normalizedName = user.loginName.toLowerCase();
    if (names.has(normalizedName)) return false;
    if (!exactKeys(user.password, ['algorithm', 'salt', 'hash']) || user.password.algorithm !== 'scrypt-v1'
      || typeof user.password.salt !== 'string' || !/^[a-f0-9]{64}$/.test(user.password.salt)
      || typeof user.password.hash !== 'string' || !/^[a-f0-9]{128}$/.test(user.password.hash)) return false;
    if (user.avatar !== null && (typeof user.avatar !== 'string' || !/^[a-f0-9]{64}\.png$/.test(user.avatar))) return false;
    names.add(normalizedName);
    ids.add(user.id);
  }
  return true;
}

class Accounts {
  #data;
  #saved = null;
  #userId = null;
  #pending = false;
  #generation = 0;
  #failures = 0;
  #lockedUntil = 0;

  constructor(dir) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, 'accounts.json');
    this.avatarDir = path.join(this.dir, 'avatars');
    fs.mkdirSync(this.dir, { recursive: true });
    if (fs.existsSync(this.file)) {
      try {
        if (fs.statSync(this.file).size > MAX_ACCOUNT_FILE_BYTES) throw new Error('size');
        const serialized = fs.readFileSync(this.file, 'utf8');
        const data = JSON.parse(serialized);
        if (!validData(data)) throw new Error('schema');
        this.#data = data;
        this.#saved = serialized;
      } catch { throw new Error(DATA_ERROR); }
    } else this.#save({ schemaVersion: 1, accounts: [] });
  }

  #assertUnchanged() {
    try {
      if (this.#saved === null) {
        if (fs.existsSync(this.file)) throw new Error('changed');
      } else if (fs.statSync(this.file).size > MAX_ACCOUNT_FILE_BYTES || fs.readFileSync(this.file, 'utf8') !== this.#saved) {
        throw new Error('changed');
      }
    } catch { throw new Error(DATA_ERROR); }
  }

  #save(data) {
    if (!validData(data)) throw new Error('账户信息格式不正确。');
    this.#assertUnchanged();
    const serialized = JSON.stringify(data, null, 2);
    if (Buffer.byteLength(serialized) > MAX_ACCOUNT_FILE_BYTES) throw new Error('账户数量已达到本机上限。');
    const temporary = this.file + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      if (this.#saved !== null) fs.copyFileSync(this.file, this.file + '.bak');
      fs.renameSync(temporary, this.file);
    } catch {
      throw new Error('账户信息保存失败，请检查数据目录是否可写。');
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    this.#data = data;
    this.#saved = serialized;
  }

  #currentUser() {
    return this.#data.accounts.find(user => user.id === this.#userId) || null;
  }

  state() {
    const user = this.#currentUser();
    let avatarUrl = '';
    if (user?.avatar) {
      const avatarFile = path.join(this.avatarDir, user.avatar);
      if (fs.existsSync(avatarFile)) avatarUrl = pathToFileURL(avatarFile).href;
    }
    return { mode: 'local', user: user ? { id: user.id, loginName: user.loginName, displayId: user.displayId, avatarUrl } : null };
  }

  async #authenticate(action) {
    if (this.#pending) throw new Error('正在处理账户请求，请稍后再试。');
    this.#pending = true;
    const generation = this.#generation;
    try {
      this.#assertUnchanged();
      return await action(() => {
        if (generation !== this.#generation) throw new Error('账户操作已取消，请重新登录。');
        this.#assertUnchanged();
      });
    } finally { this.#pending = false; }
  }

  async register(input) {
    return this.#authenticate(async confirmSession => {
      const name = loginName(input?.loginName);
      const label = displayId(input?.displayId ?? name);
      const secret = password(input?.password);
      if (this.#data.accounts.some(user => user.loginName.toLowerCase() === name.toLowerCase())) throw new Error('该登录名已存在，请选择其他名称。');
      const salt = crypto.randomBytes(32);
      const hash = await scrypt(secret, salt, 64, SCRYPT_OPTIONS);
      confirmSession();
      const user = { id: crypto.randomUUID(), loginName: name, displayId: label, password: { algorithm: 'scrypt-v1', salt: salt.toString('hex'), hash: hash.toString('hex') }, avatar: null };
      this.#save({ schemaVersion: 1, accounts: [...this.#data.accounts, user] });
      this.#userId = user.id;
      return this.state();
    });
  }

  async login(input) {
    return this.#authenticate(async confirmSession => {
      if (this.#lockedUntil > Date.now()) throw new Error('登录失败次数过多，请在 30 秒后重试。');
      if (this.#lockedUntil) { this.#failures = 0; this.#lockedUntil = 0; }
      const name = loginName(input?.loginName);
      const secret = password(input?.password);
      const user = this.#data.accounts.find(account => account.loginName.toLowerCase() === name.toLowerCase());
      const salt = user ? Buffer.from(user.password.salt, 'hex') : Buffer.alloc(32);
      const expected = user ? Buffer.from(user.password.hash, 'hex') : Buffer.alloc(64);
      const actual = await scrypt(secret, salt, 64, SCRYPT_OPTIONS);
      confirmSession();
      if (!crypto.timingSafeEqual(actual, expected) || !user) {
        this.#failures++;
        if (this.#failures >= 5) this.#lockedUntil = Date.now() + 30000;
        throw new Error(this.#lockedUntil ? '登录失败次数过多，请在 30 秒后重试。' : '登录名或密码不正确。');
      }
      this.#failures = 0;
      this.#lockedUntil = 0;
      this.#userId = user.id;
      return this.state();
    });
  }

  logout() {
    this.#generation++;
    this.#userId = null;
    return this.state();
  }

  restoreSession(id) {
    if (id !== null && !this.#data.accounts.some(user => user.id === id)) throw new Error('本地账户不存在，无法恢复会话。');
    this.#generation++;
    this.#userId = id;
    return this.state();
  }

  updateProfile(input) {
    const current = this.#currentUser();
    if (!current) throw new Error('请先登录本地账户。');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('账户资料格式不正确。');
    const user = { ...current, displayId: input.displayId === undefined ? current.displayId : displayId(input.displayId) };
    this.#assertUnchanged();
    if (input.avatarPng !== undefined) {
      if (input.avatarPng === null) user.avatar = null;
      else {
        const bytes = input.avatarPng;
        if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.length > MAX_AVATAR_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
          throw new Error('头像须为有效的 PNG 图片，且不能超过 2 MB。');
        }
        user.avatar = crypto.createHash('sha256').update(bytes).digest('hex') + '.png';
        fs.mkdirSync(this.avatarDir, { recursive: true });
        const destination = path.join(this.avatarDir, user.avatar);
        if (!fs.existsSync(destination)) fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
      }
    }
    this.#save({ schemaVersion: 1, accounts: this.#data.accounts.map(account => account.id === user.id ? user : account) });
    return this.state();
  }

  libraryDir() {
    const user = this.#currentUser();
    return user ? path.join(this.dir, 'profiles', user.id) : this.dir;
  }
}

module.exports = { Accounts };
