'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function read(dir){const file=path.join(dir,'study.json');if(!fs.existsSync(file))return [];const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(data))throw new Error('生词本格式错误，请保留原文件。');return data;}
function save(dir,raw){const word=String(raw?.word||'').trim().slice(0,100),reading=String(raw?.reading||'').trim().slice(0,100),meaning=String(raw?.meaning||'').trim().slice(0,500),sentence=String(raw?.sentence||'').trim().slice(0,3000);if(!word)throw new Error('请输入词语。');const items=read(dir);items.unshift({id:crypto.randomUUID(),word,reading,meaning,sentence,createdAt:new Date().toISOString()});const file=path.join(dir,'study.json'),tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(items,null,2),'utf8');if(fs.existsSync(file))fs.copyFileSync(file,file+'.bak');fs.renameSync(tmp,file);return items;}
module.exports={read,save};
