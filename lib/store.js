'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { SITES, ARCHIVE_TOOLS } = require('./catalog');

const DEFAULT_CATEGORIES = [
  ['story','剧情','#a78bfa'],['romance','纯爱','#f7a8c6'],['mystery','悬疑','#9b9ff3'],
  ['horror','恐怖','#e58d93'],['grotesque','猎奇','#c487d9'],['nukige','拔作','#dc90b1'],
  ['healing','治愈','#8fcbb5'],['nakige','催泪','#7eb9df'],['daily','日常','#d2b47b'],
  ['fantasy','奇幻','#a2bce9'],['scifi','科幻','#79c8d1']
].map(([id,name,color])=>({id,name,color}));
const STATUSES = ['unplayed','playing','finished','paused'];
function text(v,max=500) {return typeof v==='string'?v.trim().slice(0,max):'';}
function normalizedPath(p) {return path.resolve(p).toLocaleLowerCase('en-US');}
function validDate(v) {return typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;}
function validLibrary(d) {
  return d&&d.schemaVersion===1&&Array.isArray(d.games)&&Array.isArray(d.categories)&&d.settings&&typeof d.settings==='object'
    &&d.categories.every(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&/^#[a-f0-9]{6}$/i.test(c.color))
    &&d.games.every(g=>g&&typeof g.id==='string'&&typeof g.title==='string'&&typeof g.exePath==='string'&&Array.isArray(g.args)&&g.args.every(a=>typeof a==='string')&&Array.isArray(g.categories)&&g.categories.every(c=>typeof c==='string')&&STATUSES.includes(g.status));
}
function safeLocalPath(v,label,extensions) {
  const s=text(v,4096);
  if(!s) return '';
  if(!path.isAbsolute(s)||s.includes('\0')||/^\\\\/.test(s)||/^\/\//.test(s)) throw new Error(label+'必须是本机的绝对路径。');
  if(extensions && !extensions.includes(path.extname(s).toLowerCase())) throw new Error(label+'格式不受支持。');
  return path.normalize(s);
}
function validateGame(raw,categories,previous={}) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('游戏信息格式不正确。');
  const title=text(raw.title,200);if(!title)throw new Error('请填写游戏名称。');
  const exePath=safeLocalPath(raw.exePath,'启动文件',['.exe','.lnk','.bat','.cmd']);
  if(raw.args!==undefined&&(!Array.isArray(raw.args)||raw.args.length>100||raw.args.some(a=>typeof a!=='string'||a.includes('\0')||a.length>8192)))throw new Error('启动参数格式不正确，每行填写一个参数。');
  const validIds=new Set(categories.map(c=>c.id));
  const now=new Date().toISOString();
  return {
    id: previous.id||crypto.randomUUID(), title,originalTitle:text(raw.originalTitle,300), developer:text(raw.developer,200),
    exePath,args:raw.args||[],workDir:safeLocalPath(raw.workDir,'工作目录'),
    coverPath:text(raw.coverPath,4096),categories:[...new Set((Array.isArray(raw.categories)?raw.categories:[]).filter(id=>validIds.has(id)))],
    status:STATUSES.includes(raw.status)?raw.status:'unplayed',favorite:raw.favorite===true,notes:text(raw.notes,20000),
    addedAt:validDate(previous.addedAt)||now,updatedAt:now,lastPlayed:validDate(previous.lastPlayed),
    playSeconds:Number.isFinite(previous.playSeconds)?Math.max(0,previous.playSeconds):0,
    legacyId:previous.legacyId||null,legacyFolder:previous.legacyFolder||null,
    launchMode:(raw.launchMode??previous.launchMode)==='locale'?'locale':'normal',
    localeGuid:/^[a-f0-9-]{36}$/i.test(raw.localeGuid||previous.localeGuid||'')?(raw.localeGuid||previous.localeGuid):null
  };
}
class Store {
  constructor(dir) {
    this.dir=dir;this.file=path.join(dir,'library.json');this.coverDir=path.join(dir,'covers');
    fs.mkdirSync(this.coverDir,{recursive:true});
    if(fs.existsSync(this.file)) {
      try {this.data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(!validLibrary(this.data))throw new Error('schema');}
      catch {throw new Error('游戏库文件无法读取。请保留 library.json，并使用 library.json.bak 恢复，避免覆盖已有数据。');}
    } else {this.data={schemaVersion:1,games:[],categories:structuredClone(DEFAULT_CATEGORIES),settings:{}};this.commit();}
  }
  commit() {
    const tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(this.data,null,2),'utf8');
    if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');
    fs.renameSync(tmp,this.file);
  }
  state() {const snapshot=structuredClone(this.data);return {...snapshot,games:snapshot.games.map(g=>({...g,coverUrl:this.coverUrl(g.coverPath)})),sites:structuredClone(SITES),archiveTools:structuredClone(ARCHIVE_TOOLS),dataDir:this.dir};}
  coverUrl(p) {try {const q=path.isAbsolute(p||'')?p:path.join(this.dir,p||'');return p&&fs.existsSync(q)?pathToFileURL(q).href:'';}catch{return '';}}
  copyCover(input) {
    if(!input)return '';
    const source=path.isAbsolute(input)?input:path.join(this.dir,input);
    if(!fs.existsSync(source))return '';
    const ext=path.extname(source).toLowerCase();
    if(!['.png','.jpg','.jpeg','.webp','.gif','.bmp','.avif'].includes(ext))throw new Error('封面请使用 PNG、JPG、WebP、GIF、BMP 或 AVIF 图片。');
    if(fs.statSync(source).size>30*1024*1024)throw new Error('封面图片不能超过 30 MB。');
    const bytes=fs.readFileSync(source);const dest=path.join('covers',crypto.createHash('sha256').update(bytes).digest('hex').slice(0,24)+ext);
    if(!fs.existsSync(path.join(this.dir,dest)))fs.writeFileSync(path.join(this.dir,dest),bytes);
    return dest;
  }
  saveGame(raw) {
    const existing=raw.id?this.data.games.find(g=>g.id===raw.id):null;
    if(raw.id&&!existing)throw new Error('游戏不存在，请刷新后再试。');
    const game=validateGame(raw,this.data.categories,existing||{});
    game.coverPath=this.copyCover(game.coverPath);
    if(existing)this.data.games[this.data.games.indexOf(existing)]=game;else this.data.games.push(game);
    this.commit();return this.state();
  }
  deleteGame(id) {if(!this.data.games.some(g=>g.id===id))throw new Error('未找到游戏。');this.data.games=this.data.games.filter(g=>g.id!==id);this.commit();return this.state();}
  saveCategory(raw) {
    const name=text(raw?.name,40);if(!name)throw new Error('请填写分类名称。');
    if(this.data.categories.some(c=>c.name.toLowerCase()===name.toLowerCase()&&c.id!==raw.id))throw new Error('已存在同名分类。');
    const color=/^#[0-9a-f]{6}$/i.test(raw.color)?raw.color:'#a78bfa';
    if(raw.id){const c=this.data.categories.find(c=>c.id===raw.id);if(!c)throw new Error('分类不存在。');Object.assign(c,{name,color});}
    else this.data.categories.push({id:crypto.randomUUID(),name,color});
    this.commit();return this.state();
  }
  deleteCategory(id) {this.data.categories=this.data.categories.filter(c=>c.id!==id);for(const g of this.data.games)g.categories=g.categories.filter(c=>c!==id);this.commit();return this.state();}
  saveSettings(patch) {if(patch.legacyRoot!==undefined)this.data.settings.legacyRoot=safeLocalPath(patch.legacyRoot,'原启动器目录');if(patch.localeEmulatorPath!==undefined)this.data.settings.localeEmulatorPath=safeLocalPath(patch.localeEmulatorPath,'转区工具',['.exe']);this.commit();return this.state();}
  findGame(id) {const g=this.data.games.find(g=>g.id===id);if(!g)throw new Error('未找到游戏。');return g;}
  markLaunch(id) {const g=this.findGame(id);g.lastPlayed=new Date().toISOString();if(g.status==='unplayed')g.status='playing';this.commit();}
  addPlayTime(id,seconds) {const g=this.data.games.find(g=>g.id===id);if(g){g.playSeconds=(g.playSeconds||0)+Math.max(0,Math.round(seconds));this.commit();}}
  exportBackup(file) {
    const covers={};for(const g of this.data.games){if(g.coverPath){const p=path.join(this.dir,g.coverPath);if(fs.existsSync(p))covers[g.coverPath]=fs.readFileSync(p).toString('base64');}}
    fs.writeFileSync(file,JSON.stringify({...this.data,format:'galshelf-backup',exportedAt:new Date().toISOString(),covers},null,2),'utf8');
  }
  importBackup(file) {
    if(fs.statSync(file).size>512*1024*1024)throw new Error('备份文件过大（上限 512 MB）。');
    let data;try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error('备份文件损坏或 JSON 格式不正确。');}
    if(!data||data.schemaVersion!==1||data.format!=='galshelf-backup'||!Array.isArray(data.games)||!Array.isArray(data.categories))throw new Error('请选择 galshelf 导出的 JSON 备份。');
    if(data.categories.some(c=>!c||typeof c!=='object')||data.games.some(g=>!g||typeof g!=='object'||(g.categories!==undefined&&!Array.isArray(g.categories))))throw new Error('备份中的游戏或分类格式不正确。');
    const mergedCats=structuredClone(this.data.categories),mapping=new Map();
    for(const raw of data.categories){const name=text(raw.name,40);if(!name)continue;let c=mergedCats.find(c=>c.name.toLowerCase()===name.toLowerCase());if(!c){c={id:crypto.randomUUID(),name,color:/^#[0-9a-f]{6}$/i.test(raw.color)?raw.color:'#a78bfa'};mergedCats.push(c);}mapping.set(raw.id,c.id);}
    const pending=[];let skipped=0;
    const seenIds=new Set(this.data.games.map(g=>g.id));
    const duplicateKey=g=>g.title+'|'+(g.exePath?normalizedPath(g.exePath):'');
    const seen=new Set(this.data.games.map(duplicateKey));
    for(const raw of data.games) {
      const key=duplicateKey(raw);
      const preservedId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.id||'')?raw.id:undefined;
      if(preservedId?seenIds.has(preservedId):seen.has(key)){skipped++;continue;}
      const game=validateGame({...raw,coverPath:'',categories:(raw.categories||[]).map(c=>mapping.get(c))},mergedCats,{id:preservedId,addedAt:raw.addedAt,lastPlayed:raw.lastPlayed,playSeconds:raw.playSeconds,legacyId:raw.legacyId,legacyFolder:raw.legacyFolder});
      if(raw.coverPath&&data.covers?.[raw.coverPath]) {
        if(!/^covers[\\/][a-f0-9]{24}\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(raw.coverPath))throw new Error('备份中的封面路径无效。');
        const bytes=Buffer.from(data.covers[raw.coverPath],'base64');if(bytes.length>30*1024*1024)throw new Error('备份封面过大。');
        game.coverPath=path.join('covers',crypto.createHash('sha256').update(bytes).digest('hex').slice(0,24)+path.extname(raw.coverPath));
        pending.push({game,bytes});
      }else pending.push({game});seen.add(key);seenIds.add(game.id);
    }
    for(const {game,bytes} of pending){if(bytes)fs.writeFileSync(path.join(this.dir,game.coverPath),bytes);}
    this.data.categories=mergedCats;this.data.games.push(...pending.map(x=>x.game));this.commit();
    return {state:this.state(),added:pending.length,skipped};
  }
}
module.exports={Store,DEFAULT_CATEGORIES,SITES,validateGame,safeLocalPath,normalizedPath};
