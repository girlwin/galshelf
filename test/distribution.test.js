'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {Store}=require('../lib/store');
const {SITES,ARCHIVE_TOOLS,siteUrl,archiveToolUrl}=require('../lib/catalog');

test('a new user receives an empty library without computer-specific defaults',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'galshelf-public-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const state=new Store(dir).state();
  assert.equal(state.games.length,0);assert.deepEqual(state.settings,{});
  assert.equal(state.archiveTools.length,3);assert.equal(state.categories.some(c=>c.name==='猎奇'),true);
});
test('requested navigation is preserved exactly, without a made-up search URL or Steam',()=>{
  assert.equal(SITES.some(s=>s.id==='steam'),false);
  assert.equal(siteUrl('vlink','任意关键词 & #'), 'https://vlink.cc/0d000721');
  assert.equal(SITES.find(s=>s.id==='vlink').searchTemplate,undefined);
  assert.throws(()=>siteUrl('https://example.com/'),/不存在/);
});
test('archive downloads are fixed official HTTPS pages, independent of game search',()=>{
  const expected={unisunzip:'https://www.unisapps.com/',winrar:'https://www.rarlab.com/download.htm','7zip':'https://www.7-zip.org/download.html'};
  assert.deepEqual(Object.fromEntries(ARCHIVE_TOOLS.map(t=>[t.id,t.home])),expected);
  for(const [id,url] of Object.entries(expected)){assert.equal(archiveToolUrl(id),url);assert.equal(new URL(url).protocol,'https:');}
  assert.throws(()=>archiveToolUrl('file:///C:/'),/不存在/);
  assert.equal(SITES.some(s=>ARCHIVE_TOOLS.some(t=>t.id===s.id)),false);
});
