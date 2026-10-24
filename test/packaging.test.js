'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {RUNTIME_FILES,stageRuntime,auditRuntime}=require('../lib/distribution');

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'galshelf-package-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'source'),destination=path.join(root,'staging');
  for(const file of RUNTIME_FILES){const target=path.join(source,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'public program resource: '+file);}
  return{root,source,destination,manifest:{name:'galshelf',productName:'galshelf',version:'1.2.0',description:'Local game launcher',main:'main.js',license:'MIT'}};
}

test('release staging excludes private libraries, covers, accounts and sessions even inside resource directories',t=>{
  const {source,destination,manifest}=fixture(t);
  const privateFiles=['library.json','library.json.bak','accounts.json','session.json','lib/accounts.json','lib/data/library.json','src/settings.json','src/session.json','assets/cover.png','assets/covers/private.png','assets/avatars/private.png','assets/accounts.json','userData/library.json','profiles/alice/accounts.json','.env','test/private-fixture.json','node_modules/private.json'];
  for(const file of privateFiles){const target=path.join(source,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'SYNTHETIC_PRIVATE_DATA_DO_NOT_SHIP');}
  const shipped=stageRuntime(source,destination,manifest);
  assert.deepEqual(shipped,[...RUNTIME_FILES,'package.json'].sort());
  for(const file of privateFiles)assert.equal(fs.existsSync(path.join(destination,file)),false,file+' must not ship');
  for(const file of shipped)assert.equal(fs.readFileSync(path.join(destination,file),'utf8').includes('SYNTHETIC_PRIVATE_DATA_DO_NOT_SHIP'),false);
});

test('runtime manifest discards development scripts, dependencies and local configuration',t=>{
  const {source,destination,manifest}=fixture(t);
  stageRuntime(source,destination,{...manifest,scripts:{start:'read-private-data'},dependencies:{secret:'file:../secret'},config:{dataDir:'C:/synthetic/private'},accounts:[{id:'private'}]});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(destination,'package.json'),'utf8')),manifest);
});

test('runtime audit rejects extra files or directories and staging refuses existing data',t=>{
  const {source,destination,manifest}=fixture(t);
  stageRuntime(source,destination,manifest);
  assert.throws(()=>stageRuntime(source,destination,manifest),/must be empty/);
  const extra=path.join(destination,'accounts.json');fs.writeFileSync(extra,'synthetic account');
  assert.throws(()=>auditRuntime(destination),/Unexpected release file: accounts.json/);
  fs.unlinkSync(extra);fs.mkdirSync(path.join(destination,'avatars'));
  assert.throws(()=>auditRuntime(destination),/Unexpected release directory: avatars/);
});

test('linked source directories cannot redirect allowed assets to local data',t=>{
  const {root,source,destination,manifest}=fixture(t);
  const external=path.join(root,'external-assets');
  fs.renameSync(path.join(source,'assets'),external);
  fs.symlinkSync(external,path.join(source,'assets'),'junction');
  assert.throws(()=>stageRuntime(source,destination,manifest),/without linked parents/);
  assert.deepEqual(fs.readdirSync(destination),[]);
});

test('missing required program files fail the release instead of silently creating an incomplete app',t=>{
  const {source,destination,manifest}=fixture(t);
  fs.unlinkSync(path.join(source,'lib','accounts.js'));
  assert.throws(()=>stageRuntime(source,destination,manifest),{code:'ENOENT'});
  assert.deepEqual(fs.readdirSync(destination),[]);
});
