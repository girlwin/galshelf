'use strict';
const VERSION=require('../package.json').version;
const API='https://api.vndb.org/kana/vn';
const USER_AGENT=`galshelf/${VERSION} (Windows desktop)`;
const FIELDS='title,alttitle,titles.title,titles.lang,titles.latin,aliases,image.url,description,released,developers.name';

// VNDB stores VN covers under cv; screenshots (sf) must never become a cover.
function coverUrl(value){
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&url.hostname==='t.vndb.org'&&!url.port&&!url.username&&!url.password
      &&/^\/cv\/\d{2}\/\d+\.(?:jpe?g|png|webp)$/i.test(url.pathname)&&!url.search&&!url.hash?url.href:'';
  }catch{return '';}
}
function cleanQuery(value){
  let query=value.normalize('NFKC');
  const packaging=/汉化|汉硬|硬盘|免安装|整合|补丁|简体|繁体|中文|解压|资源|绿色|PC版|windows|win32|win64|^\s*(?:steam|gog|v\d[\d.]*|\d{6,8})\s*$/i;
  query=query.replace(/\[[^\]]{1,80}\]|【[^】]{1,80}】|\([^)]{1,80}\)/g,part=>packaging.test(part.slice(1,-1))?' ':part);
  return query.replace(/\.(?:exe|zip|7z|rar)$/i,'').replace(/[\s_-]+(?:ver\.?|v)\s*\d+(?:\.\d+){1,3}[a-z]?$/i,'').replace(/\s+/g,' ').replace(/^[\s_-]+|[\s_-]+$/g,'');
}
function searchInput(value){
  const query=typeof value==='string'?value.trim():'';
  if(!query)throw new Error('请填写游戏名称、VNDB ID 或条目链接后再检索。');
  if(query.length>400||/[\u0000-\u001f\u007f]/.test(query))throw new Error('搜索内容过长或包含无效字符。');
  const direct=/^(v[1-9]\d{0,9})$/i.exec(query)||/^https:\/\/(?:www\.)?vndb\.org\/(v[1-9]\d{0,9})\/?(?:[?#][^\s]*)?$/i.exec(query);
  if(direct)return {query,normalizedQuery:direct[1].toLowerCase(),id:direct[1].toLowerCase()};
  if(/^[a-z]:|^\/|\\|^[a-z][a-z\d+.-]*:\/\//i.test(query))throw new Error('请只输入游戏名称或 VNDB 条目链接，不要输入本机路径或其他网址。');
  const normalizedQuery=cleanQuery(query).slice(0,200);
  if(!normalizedQuery)throw new Error('没有识别到游戏名，请输入原文名称或 VNDB ID。');
  return {query,normalizedQuery,id:null};
}
function comparable(value){return typeof value==='string'?value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\p{P}\p{Z}\s]/gu,''):'';}
function plain(value,limit){return typeof value==='string'?value.slice(0,limit):'';}
function match(item,input){
  const titles=Array.isArray(item.titles)?item.titles.filter(t=>t&&typeof t.title==='string'):[];
  const names=[item.title,item.alttitle,...titles.flatMap(t=>[t.title,t.latin]),...(Array.isArray(item.aliases)?item.aliases:[])].map(comparable).filter(Boolean);
  const key=comparable(input.normalizedQuery);
  const exact=Boolean(key)&&names.includes(key);
  const partial=Boolean(key)&&names.some(name=>name.includes(key));
  const chinese=titles.find(t=>t.lang==='zh-Hans')||titles.find(t=>typeof t.lang==='string'&&t.lang.startsWith('zh'));
  const original=typeof item.alttitle==='string'&&item.alttitle.trim()?item.alttitle:item.title;
  return {
    id:item.id,source:'VNDB',title:plain(chinese?.title||original,200),originalTitle:plain(original,300),
    summary:plain(item.description,10000),coverUrl:coverUrl(item.image?.url),sourceUrl:`https://vndb.org/${item.id}`,
    developer:(Array.isArray(item.developers)?item.developers.map(p=>plain(p?.name,100)).filter(Boolean):[]).join(' / ').slice(0,200),
    released:plain(item.released,10),matchLabel:input.id?'精确条目':exact?'名称完全匹配':'候选作品',score:input.id?3:exact?2:partial?1:0
  };
}
async function readLimited(response,limit){
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('网站返回的内容过大，请选择其他条目。');}
  if(!response.body)throw new Error('网站未返回内容。');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('网站返回的内容过大，请选择其他条目。');chunks.push(Buffer.from(value));}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
class Metadata {
  constructor({fetchImpl=globalThis.fetch}={}){this.fetch=fetchImpl;this.matches=new Map();}
  async request(url,options,limit){
    try{
      const response=await this.fetch(url,{...options,headers:{'User-Agent':USER_AGENT,...options?.headers},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok){await response.body?.cancel();throw new Error(response.status===429?'VNDB 请求过多，请稍后重试。':`VNDB 暂不可用（${response.status}），仍可手动添加游戏。`);}
      return {bytes:await readLimited(response,limit),type:response.headers.get('content-type')||''};
    }catch(error){if(/VNDB 请求|VNDB 暂|网站返回|网站未/.test(error.message))throw error;throw new Error('连接 VNDB 失败或超时，请稍后重试，也可手动填写资料和本地封面。');}
  }
  async search(value){
    const input=searchInput(value);
    const body={filters:[input.id?'id':'search','=',input.normalizedQuery],fields:FIELDS,sort:input.id?'id':'searchrank',results:12};
    const {bytes}=await this.request(API,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)},2*1024*1024);
    let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('VNDB 返回了无法读取的资料，请稍后重试。');}
    if(!Array.isArray(data.results))throw new Error('VNDB 返回格式已变化，请手动添加游戏。');
    const seen=new Set();
    const results=data.results.filter(item=>{
      if(!item||typeof item.id!=='string'||!/^v[1-9]\d*$/.test(item.id)||typeof item.title!=='string'||seen.has(item.id)||(input.id&&item.id!==input.id))return false;
      seen.add(item.id);return true;
    }).slice(0,12).map(item=>match(item,input)).sort((a,b)=>b.score-a.score).map(({score,...item})=>item);
    for(const item of results)this.matches.set(item.id,{...item,expires:Date.now()+30*60*1000});
    while(this.matches.size>200)this.matches.delete(this.matches.keys().next().value);
    return {query:input.query,normalizedQuery:input.normalizedQuery,source:'VNDB',results};
  }
  async downloadCover(id){
    const item=this.matches.get(String(id));
    if(!item||item.expires<Date.now())throw new Error('检索结果已过期，请重新检索后选择。');
    if(!item.coverUrl)return null;
    const {bytes,type}=await this.request(item.coverUrl,{method:'GET',headers:{Accept:'image/png,image/jpeg,image/webp'}},8*1024*1024);
    if(!/^image\/(png|jpe?g|webp)(?:;|$)/i.test(type))throw new Error('VNDB 封面不是支持的图片格式，请手动选择本地封面。');
    return bytes;
  }
}
module.exports={Metadata,coverUrl,readLimited,cleanQuery,searchInput};
