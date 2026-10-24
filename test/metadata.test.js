'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Metadata,coverUrl,searchInput}=require('../lib/metadata');
const fixture={id:'v4',title:'CLANNAD',alttitle:null,titles:[{lang:'zh-Hans',title:'测试作品',latin:null}],aliases:['クラナド'],description:'合成资料',released:'2004-04-28',developers:[{name:'Key'}],image:{url:'https://t.vndb.org/cv/95/75895.jpg'}};
function mock(results){const calls=[];return {calls,metadata:new Metadata({fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({results,more:false});}})};}
test('search targets the VNDB visual novel endpoint with only cleaned title and explicit cover fields',async()=>{
  const {metadata,calls}=mock([fixture]);const result=await metadata.search('[汉化硬盘版] CLANNAD v1.2.zip');
  assert.equal(result.source,'VNDB');assert.equal(result.normalizedQuery,'CLANNAD');assert.equal(result.results[0].developer,'Key');assert.equal(result.results[0].coverUrl,fixture.image.url);
  assert.equal(calls[0].url,'https://api.vndb.org/kana/vn');
  const request=JSON.parse(calls[0].options.body);assert.deepEqual(request.filters,['search','=','CLANNAD']);assert.equal(request.sort,'searchrank');
  assert(request.fields.split(',').includes('image.url'));assert(!request.fields.includes('screenshots'));
  assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.credentials,'omit');
});
test('VNDB ID and entry URL use exact identity queries and reject mismatched returned records',async()=>{
  for(const query of ['v4','V4','https://vndb.org/v4','https://vndb.org/v4#main']){
    const {metadata,calls}=mock([{...fixture,id:'v400'},fixture]);const result=await metadata.search(query);
    assert.deepEqual(JSON.parse(calls[0].options.body).filters,['id','=','v4']);assert.deepEqual(result.results.map(r=>r.id),['v4']);assert.equal(result.results[0].matchLabel,'精确条目');
  }
});
test('matching ranks exact original titles, Chinese names and aliases ahead of related releases',async()=>{
  const other={...fixture,id:'v400',title:'CLANNAD Side Story',titles:[],aliases:[]};
  for(const query of ['CLANNAD','测试作品','クラナド']){
    const {metadata}=mock([other,fixture,{...fixture}]);const result=await metadata.search(query);
    assert.equal(result.results.length,2);assert.equal(result.results[0].id,'v4');assert.equal(result.results[0].matchLabel,'名称完全匹配');
  }
});
test('only API cover URLs are accepted; screenshots, other sites, credentials and redirects are rejected',async()=>{
  for(const url of ['file:///C:/private','https://lain.bgm.tv/pic/cover/l/a.jpg','https://evil.example/cv/95/75895.jpg','https://t.vndb.org:8443/cv/95/75895.jpg','https://evil@t.vndb.org/cv/95/75895.jpg','https://t.vndb.org/sf/95/75895.jpg','https://t.vndb.org/cv.t/95/75895.jpg','https://t.vndb.org/cv/95/75895.jpg?redirect=1'])assert.equal(coverUrl(url),'');
  assert.equal(coverUrl(fixture.image.url),fixture.image.url);
  const {metadata}=mock([{...fixture,image:{id:'cv75895'},screenshots:[{url:fixture.image.url}]}]);
  assert.equal((await metadata.search('CLANNAD')).results[0].coverUrl,'');assert.equal(await metadata.downloadCover('v4'),null);
});
test('cover downloads require selected cached results and enforce the image type and same cover URL',async()=>{
  const calls=[];const metadata=new Metadata({fetchImpl:async(url)=>{calls.push(url);return calls.length===1?Response.json({results:[fixture]}):new Response('not an image',{headers:{'Content-Type':'text/html'}});}});
  await assert.rejects(metadata.downloadCover('v4'),/过期/);assert.equal(calls.length,0);
  await metadata.search('CLANNAD');await assert.rejects(metadata.downloadCover('v4'),/图片格式/);assert.equal(calls[1],fixture.image.url);
});
test('private paths and unrelated URLs never leave the computer, while meaningful title punctuation is preserved',async()=>{
  const {metadata,calls}=mock([]);
  for(const query of ['C:\\private\\game','C:/private/game','\\\\server\\game','/home/user/game','file:///C:/game','https://evil.example/v4'])await assert.rejects(metadata.search(query),/路径|网址/);
  assert.equal(calls.length,0);assert.equal(searchInput('STEINS;GATE').normalizedQuery,'STEINS;GATE');assert.equal(searchInput('[title] Special').normalizedQuery,'[title] Special');
  assert.throws(()=>searchInput('[汉化版]'),/游戏名/);
});
test('malformed optional fields, empty results and unavailable networks preserve manual entry',async()=>{
  const {metadata}=mock([{...fixture,alttitle:123,titles:null,aliases:null,developers:null}]);assert.equal((await metadata.search('test')).results[0].title,'CLANNAD');
  assert.deepEqual((await mock([]).metadata.search('nothing')).results,[]);
  const offline=new Metadata({fetchImpl:async()=>{throw Error('private network detail');}});await assert.rejects(offline.search('test'),/VNDB.*手动/);
  const rateLimited=new Metadata({fetchImpl:async()=>new Response('',{status:429})});await assert.rejects(rateLimited.search('test'),/请求过多/);
});
test('oversized responses, non-VN records and expired selections cannot populate the cover cache',async()=>{
  const oversized=new Metadata({fetchImpl:async()=>new Response('{}',{headers:{'content-length':String(3*1024*1024)}})});await assert.rejects(oversized.search('test'),/过大/);
  const {metadata}=mock([{id:123,name:'ordinary game'},{...fixture,id:'r4'},fixture]);assert.equal((await metadata.search('CLANNAD')).results.length,1);
  metadata.matches.get('v4').expires=0;await assert.rejects(metadata.downloadCover('v4'),/过期/);
});
