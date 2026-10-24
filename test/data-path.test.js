'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {dataPaths,prepareDataDirectory}=require('../lib/data-path');
const {Store}=require('../lib/store');
const {Accounts}=require('../lib/accounts');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S0AAAAASUVORK5CYII=','base64');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'galshelf-migrate-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}

test('default storage depends only on user home, and explicit developer overrides stay isolated',t=>{
  const home=fixture(t),first=dataPaths({home});
  assert.deepEqual(first,{cache:path.join(home,'.galshelf'),library:path.join(home,'.galshelf','data'),migrate:true});
  assert.deepEqual(dataPaths({home,legacyDir:path.join(home,'virtual-appdata')}),first);
  const custom=path.join(home,'synthetic-test-data');
  assert.deepEqual(dataPaths({home,override:custom}),{cache:custom,library:custom,migrate:false});
});

test('migration is one-time: switching launchers and legacy AppData views cannot reset the canonical library',t=>{
  const home=fixture(t),oldA=path.join(home,'packaged-appdata'),oldB=path.join(home,'desktop-appdata');
  const legacy=new Store(oldA);legacy.saveGame({title:'第一部',categories:['grotesque']});legacy.saveGame({title:'第二部'});
  new Store(oldB).saveGame({title:'另一启动环境的一条记录'});
  const destination=dataPaths({home}).library;
  prepareDataDirectory(destination,oldA);
  const migrated=new Store(destination);const ids=migrated.data.games.map(g=>g.id);
  migrated.saveGame({...migrated.data.games[0],favorite:true});
  for(let restart=0;restart<5;restart++){
    prepareDataDirectory(destination,restart%2?oldA:oldB);
    const reopened=new Store(destination);
    assert.deepEqual(reopened.data.games.map(g=>g.id),ids);
    assert.equal(reopened.data.games[0].favorite,true);
  }
  assert.equal(new Store(oldA).data.games[0].favorite,false);
});

test('migration keeps profile identity, password login, covers, avatars and history without copying browser caches',async t=>{
  const home=fixture(t),legacy=path.join(home,'old-data'),destination=dataPaths({home}).library;
  const visitor=new Store(legacy);const cover=path.join(home,'source.png');fs.writeFileSync(cover,PNG);
  visitor.saveGame({title:'访客作品',coverPath:cover});visitor.markLaunch(visitor.data.games[0].id);visitor.addPlayTime(visitor.data.games[0].id,135);
  const accounts=new Accounts(legacy);await accounts.register({loginName:'migration_reader',password:'synthetic-password',displayId:'测试账户'});
  accounts.updateProfile({avatarPng:PNG});
  const userId=accounts.state().user.id,profile=new Store(accounts.libraryDir());profile.saveGame({title:'账户独立作品',coverPath:cover});
  const accountsBytes=fs.readFileSync(path.join(legacy,'accounts.json'));
  fs.mkdirSync(path.join(legacy,'Cache'));fs.writeFileSync(path.join(legacy,'Cache','do-not-copy'),'browser cache');
  fs.writeFileSync(path.join(legacy,'covers','unrelated-secret.txt'),'not a cover');
  prepareDataDirectory(destination,legacy);
  assert.ok(fs.readFileSync(path.join(destination,'accounts.json')).equals(accountsBytes));
  const restoredVisitor=new Store(destination);assert.equal(restoredVisitor.data.games[0].playSeconds,135);
  assert.ok(fs.readFileSync(path.join(destination,restoredVisitor.data.games[0].coverPath)).equals(PNG));
  const restoredAccounts=new Accounts(destination);await restoredAccounts.login({loginName:'migration_reader',password:'synthetic-password'});
  assert.equal(restoredAccounts.state().user.id,userId);assert.ok(restoredAccounts.state().user.avatarUrl);
  const restoredProfile=new Store(restoredAccounts.libraryDir());assert.equal(restoredProfile.data.games[0].title,'账户独立作品');
  assert.ok(fs.readFileSync(path.join(restoredProfile.dir,restoredProfile.data.games[0].coverPath)).equals(PNG));
  assert.equal(fs.existsSync(path.join(destination,'Cache')),false);assert.equal(fs.existsSync(path.join(destination,'covers','unrelated-secret.txt')),false);
});

test('a failed or interrupted migration never publishes an empty library or modifies its source',t=>{
  const home=fixture(t),legacy=path.join(home,'old-data'),destination=dataPaths({home}).library;
  const store=new Store(legacy);store.saveGame({title:'必须保留的资料'});const valid=fs.readFileSync(store.file);
  fs.writeFileSync(store.file,'{broken');
  assert.throws(()=>prepareDataDirectory(destination,legacy),/迁移已停止/);
  assert.equal(fs.existsSync(destination),false);assert.equal(fs.readFileSync(store.file,'utf8'),'{broken');
  fs.writeFileSync(store.file,valid);
  prepareDataDirectory(destination,legacy);
  assert.ok(fs.readFileSync(path.join(destination,'library.json')).equals(valid));
  assert.equal(new Store(destination).data.games[0].title,'必须保留的资料');
});

test('a fresh install stays empty and never imports from bundled or unrelated game directories',t=>{
  const home=fixture(t),destination=dataPaths({home}).library;
  const unrelated=new Store(path.join(home,'unrelated-manager'));unrelated.saveGame({title:'不应自动识别'});
  prepareDataDirectory(destination,null);
  assert.equal(new Store(destination).data.games.length,0);
});
