'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {validLibrary}=require('./store');

// AppData can be virtualized by the MSIX identity inherited from a launcher.
// A directory directly under the user's home has one location in both contexts.
function dataPaths({home,override}){
  const cache=override?path.resolve(override):path.join(home,'.galshelf');
  if(!path.isAbsolute(cache))throw new Error('本地数据目录必须是绝对路径。');
  return {cache,library:override?cache:path.join(cache,'data'),migrate:!override};
}

function prepareDataDirectory(destination,legacy){
  destination=path.resolve(destination);
  if(fs.existsSync(destination)){
    if(!fs.statSync(destination).isDirectory())throw new Error('本地数据路径不是目录。');
    return destination;
  }
  const parent=path.dirname(destination);
  fs.mkdirSync(parent,{recursive:true});
  const staging=fs.mkdtempSync(path.join(parent,'.galshelf-migration-'));
  function copyFile(source,target,library=false){
    const stat=fs.lstatSync(source);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('旧游戏库中包含无法迁移的链接文件，请保留原目录并手动导入备份。');
    if(library){
      let data;try{data=JSON.parse(fs.readFileSync(source,'utf8'));}catch{}
      if(!validLibrary(data))throw new Error('旧游戏库文件无法读取，迁移已停止，原数据保持不变。请先检查 library.json.bak。');
    }
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(source,target);
  }
  function assets(source,target,pattern){
    if(!fs.existsSync(source))return;
    if(fs.lstatSync(source).isSymbolicLink())throw new Error('旧游戏库的资源目录是链接，请先手动导出备份。');
    for(const name of fs.readdirSync(source))if(pattern.test(name))copyFile(path.join(source,name),path.join(target,name));
  }
  function library(source,target){
    for(const name of ['library.json','library.json.bak']){
      const file=path.join(source,name);
      if(fs.existsSync(file))copyFile(file,path.join(target,name),name==='library.json');
    }
    assets(path.join(source,'covers'),path.join(target,'covers'),/^[a-f0-9]{24}(?:[a-f0-9]{40})?\.(png|jpe?g|webp|gif|bmp|avif)$/i);
  }
  // Publish the complete persistent-data directory with one rename. On an error
  // or interrupted copy the destination stays absent, so startup can retry.
  if(legacy&&fs.existsSync(legacy)){
    library(legacy,staging);
    for(const name of ['accounts.json','accounts.json.bak']){
      const file=path.join(legacy,name);
      if(fs.existsSync(file))copyFile(file,path.join(staging,name));
    }
    assets(path.join(legacy,'avatars'),path.join(staging,'avatars'),/^[a-f0-9]{64}\.png$/i);
    const profiles=path.join(legacy,'profiles');
    if(fs.existsSync(profiles)){
      if(fs.lstatSync(profiles).isSymbolicLink())throw new Error('旧账户目录是链接，请先手动导出备份。');
      for(const name of fs.readdirSync(profiles)){
        if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(name))continue;
        const profile=path.join(profiles,name);
        if(fs.lstatSync(profile).isSymbolicLink())throw new Error('旧账户目录是链接，请先手动导出备份。');
        if(fs.statSync(profile).isDirectory())library(profile,path.join(staging,'profiles',name));
      }
    }
  }
  fs.renameSync(staging,destination);
  return destination;
}
module.exports={dataPaths,prepareDataDirectory};
