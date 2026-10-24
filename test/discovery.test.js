'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {scanGameFolder}=require('../lib/discovery');

function fixture(t,name='[汉化硬盘版] [免安装] 空色の物語'){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'galshelf-discovery-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const folder=path.join(root,name);fs.mkdirSync(folder);
  function write(relative){const target=path.join(folder,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'Synthetic fixture; this file is not executable.');return target;}
  return{root,folder,write};
}

test('folder scan preserves non-ASCII game titles and recommends matching EXEs without executing files',async t=>{
  const {folder,write}=fixture(t);
  const expected=write('空色の物語.EXE');write('launcher.exe');write('bin/alternate.exe');write('readme.txt');
  const result=await scanGameFolder(folder);
  assert.equal(result.folder,folder);assert.equal(result.title,'空色の物語');assert.equal(result.suggestedExe,expected);
  assert.equal(result.executables.length,3);assert.equal(result.executables[0].relativePath,'空色の物語.EXE');
  assert.equal(result.warning,undefined);
  for(const candidate of result.executables){assert.equal(path.isAbsolute(candidate.path),true);assert.equal(typeof candidate.score,'number');}
});

test('scan filters tools and installers while retaining the game candidates for manual choice',async t=>{
  const {folder,write}=fixture(t,'[作品名] 月の庭');
  const ignored=['setup.exe','unins000.exe','CrashReport.exe','configtool.exe','Updater.exe','UnityCrashHandler64.exe','LEProc.exe','node_modules/game.exe','.git/game.exe','redist/game.exe','System/game.exe','工具/game.exe'];
  ignored.forEach(write);write('game.exe');write('bin/play.exe');
  const result=await scanGameFolder(folder);
  assert.equal(result.title,'[作品名] 月の庭');assert.equal(result.executables.length,2);
  assert.deepEqual(new Set(result.executables.map(item=>item.relativePath)),new Set(['game.exe',path.join('bin','play.exe')]));
});

test('empty folders return an empty list instead of inventing a launch path',async t=>{
  const {folder,write}=fixture(t);write('setup.exe');write('notes.txt');
  const result=await scanGameFolder(folder);assert.deepEqual(result.executables,[]);assert.equal(result.suggestedExe,'');
});

test('scan rejects relative paths, network paths, drives and non-directory selections with readable errors',async t=>{
  const {folder,write}=fixture(t);const file=write('game.exe');
  for(const invalid of ['relative/game','\\\\server\\games','//server/games','',null])await assert.rejects(scanGameFolder(invalid),/本机|完整|网络/);
  await assert.rejects(scanGameFolder(path.parse(folder).root),/整个磁盘/);
  await assert.rejects(scanGameFolder(file),/不是文件夹/);
  await assert.rejects(scanGameFolder(path.join(folder,'missing')),/不存在/);
});

test('directory links are never followed and linked selections including parent links are rejected',async t=>{
  const {root,folder,write}=fixture(t);write('game.exe');
  const external=path.join(root,'external');fs.mkdirSync(path.join(external,'child'),{recursive:true});fs.writeFileSync(path.join(external,'outside.exe'),'Synthetic fixture');
  const link=path.join(folder,'linked');fs.symlinkSync(external,link,'junction');
  const result=await scanGameFolder(folder);assert.equal(result.executables.length,1);assert.match(result.warning,/跳过.*链接/);
  await assert.rejects(scanGameFolder(link),/链接/);
  await assert.rejects(scanGameFolder(path.join(link,'child')),/链接/);
});

test('depth limit is visible and excludes executables below three child directory levels',async t=>{
  const {folder,write}=fixture(t);write('a/b/c/allowed.exe');write('a/b/c/d/too-deep.exe');
  const result=await scanGameFolder(folder);assert.equal(result.executables.length,1);assert.equal(result.executables[0].relativePath,path.join('a','b','c','allowed.exe'));assert.match(result.warning,/3 层/);
});

test('candidate limit is visible and caps results at one hundred',async t=>{
  const {folder,write}=fixture(t);for(let i=0;i<101;i++)write('play-'+String(i).padStart(3,'0')+'.exe');
  const result=await scanGameFolder(folder);assert.equal(result.executables.length,100);assert.match(result.warning,/100 个/);
});

test('entry limit is visible even when a folder contains no launch candidates',async t=>{
  const {folder,write}=fixture(t);for(let i=0;i<5001;i++)write('entry-'+String(i).padStart(4,'0')+'.txt');
  const result=await scanGameFolder(folder);assert.deepEqual(result.executables,[]);assert.equal(result.suggestedExe,'');assert.match(result.warning,/5000 个/);
});
