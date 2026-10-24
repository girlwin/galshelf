'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');

const MAX_DEPTH=3;
const MAX_ENTRIES=5000;
const MAX_CANDIDATES=100;
const SKIP_DIRECTORIES=new Set(['node_modules','.git','.svn','.vs','redist','_commonredist','redistributables','directx','system','system32','syswow64','tools','tool','utilities','utility','support','drivers','driver','uninstall','工具','工具箱','运行库','运行环境','补丁工具','安装组件']);
const SKIP_EXECUTABLE=/^(?:setup|install|unins|crash|unitycrashhandler|config|settings|updat|patcher|dxsetup|vcredist|vc_redist|dotnet|directx|leproc|legui|localeemulator)/i;

function gameTitle(folder){
  let title=path.basename(folder);
  const packaging=/^[\s_\-]*[\[【]([^\]】]*)[\]】][\s_\-]*/u;
  let match;
  while((match=title.match(packaging))&&/(?:汉化|漢化|硬盘|硬盤|免安装|免安裝|官中|简中|簡中|繁中|中文|机翻|機翻|补丁|補丁|整合|解压|解壓|galgame|visual\s*novel|repack|portable|^x(?:86|64)$|^v?\d+(?:[.\-]\d+)*$)/i.test(match[1]))title=title.slice(match[0].length);
  return title.trim()||path.basename(folder);
}

async function validatedRoot(folder){
  if(typeof folder!=='string'||!folder.trim()||folder.includes('\0')||!path.isAbsolute(folder)||/^(?:\\\\|\/\/)/.test(folder)||(process.platform==='win32'&&!/^[a-z]:[\\/]/i.test(folder)))throw new Error('请选择本机的完整游戏文件夹路径，不支持网络路径。');
  const root=path.resolve(folder),volume=path.parse(root).root;
  if(root===volume)throw new Error('请选择具体游戏文件夹，不能扫描整个磁盘。');
  let current=volume;
  for(const segment of root.slice(volume.length).split(path.sep).filter(Boolean)){
    current=path.join(current,segment);
    let stat;
    try{stat=await fs.lstat(current);}catch(error){throw new Error(error.code==='ENOENT'?'游戏文件夹不存在，请重新选择。':'无法读取游戏文件夹，请检查访问权限。');}
    if(stat.isSymbolicLink())throw new Error('不支持符号链接或目录链接，请选择游戏实际所在的文件夹。');
    if(!stat.isDirectory())throw new Error('所选路径不是文件夹，请重新选择游戏文件夹。');
  }
  return root;
}

function executableScore(name,title,depth){
  const normalize=value=>value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const stem=normalize(path.basename(name,path.extname(name))),game=normalize(title);
  let score=100-depth*12;
  if(stem===game)score+=80;
  else if(stem.length>=3&&game.length>=3&&(stem.includes(game)||game.includes(stem)))score+=30;
  if(/^(?:game|main|start|launcher|launch|游戏|遊戲)(?:32|64)?$/i.test(stem))score+=20;
  return score;
}

async function scanGameFolder(folder){
  const root=await validatedRoot(folder),title=gameTitle(root),executables=[],warnings=new Set();
  let entries=0,stopped=false;
  async function walk(directory,depth){
    let handle;
    try{handle=await fs.opendir(directory);}catch(error){if(directory===root)throw new Error('无法读取游戏文件夹，请检查访问权限。');warnings.add('部分子文件夹无法读取，已跳过。');return;}
    for await(const entry of handle){
      if(stopped)break;
      if(entries>=MAX_ENTRIES){warnings.add('最多检查 5000 个文件或文件夹，部分内容尚未扫描。');stopped=true;break;}
      entries++;
      const entryPath=path.join(directory,entry.name);
      // Junctions and symbolic links are not followed, including links to EXEs.
      if(entry.isSymbolicLink()){warnings.add('已跳过符号链接或目录链接。');continue;}
      if(entry.isDirectory()){
        if(SKIP_DIRECTORIES.has(entry.name.toLocaleLowerCase()))continue;
        if(depth>=MAX_DEPTH){warnings.add('最多扫描 3 层子文件夹，更深层内容尚未检查。');continue;}
        await walk(entryPath,depth+1);
      }else if(entry.isFile()&&path.extname(entry.name).toLowerCase()==='.exe'&&!SKIP_EXECUTABLE.test(path.basename(entry.name,path.extname(entry.name)))){
        if(executables.length>=MAX_CANDIDATES){warnings.add('最多列出 100 个启动程序，其余候选尚未列出。');stopped=true;break;}
        executables.push({path:entryPath,relativePath:path.relative(root,entryPath),score:executableScore(entry.name,title,depth)});
      }
    }
  }
  try{await walk(root,0);}catch(error){
    if(error.message==='无法读取游戏文件夹，请检查访问权限。')throw error;
    throw new Error('扫描游戏文件夹失败，请确认文件夹仍然存在且具有读取权限。');
  }
  executables.sort((left,right)=>right.score-left.score||left.relativePath.localeCompare(right.relativePath,'zh-CN'));
  return{folder:root,title,executables,suggestedExe:executables[0]?.path||'',...(warnings.size?{warning:[...warnings].join(' ')}:{})};
}

module.exports={scanGameFolder};
