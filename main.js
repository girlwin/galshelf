'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,session,nativeImage,net}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {fileURLToPath}=require('node:url');
const crypto=require('node:crypto');
const {Store}=require('./lib/store');
const {Accounts}=require('./lib/accounts');
const {scanGameFolder}=require('./lib/discovery');
const {Metadata}=require('./lib/metadata');
const {dataPaths,prepareDataDirectory}=require('./lib/data-path');
const {siteUrl,archiveToolUrl}=require('./lib/catalog');

app.setName('galshelf');
const legacyDataDir=app.getPath('userData');
const storage=dataPaths({home:app.getPath('home'),override:process.env.GALSHELF_DATA_DIR});
fs.mkdirSync(storage.cache,{recursive:true});
app.setPath('userData',storage.cache);
const smoke=process.argv.includes('--smoke-test');
const processes=new Map();
const launching=new Set();
let mainWindow,store,accounts,metadata;
let activeOperations=0,switchingAccount=false;
const accountSwitches=new Set(['registerAccount','loginAccount','logoutAccount']);
const mainHtml=path.join(__dirname,'src','index.html');
const ownsInstance=smoke||app.requestSingleInstanceLock();
if(!ownsInstance)app.quit();
app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});

function decorate(snapshot){return {...snapshot,account:accounts.state(),runningGameIds:[...processes.keys()]};}
function state(){return decorate(store.state());}
function trusted(event){try{return event.sender===mainWindow.webContents&&event.senderFrame===event.sender.mainFrame&&fileURLToPath(event.senderFrame.url)===mainHtml;}catch{return false;}}
function handle(name,fn){ipcMain.handle('gal:'+name,async(event,...args)=>{
  if(!trusted(event))return {__error:'拒绝来自其他页面的操作。'};
  let acquired=false;
  try{
    if(switchingAccount)throw new Error('正在切换账户，请稍后重试。');
    if(accountSwitches.has(name)){
      if(activeOperations||processes.size||launching.size)throw new Error('请先关闭正在运行的游戏或等待当前操作完成，再切换账户。');
      switchingAccount=true;
    }else activeOperations++;
    acquired=true;
    const result=await fn(...args);
    if(result&&Array.isArray(result.games))return decorate(result);
    if(result?.state&&Array.isArray(result.state.games))return {...result,state:decorate(result.state)};
    return result;
  }catch(e){return {__error:e.message||'操作未完成，请重试。'};}
  finally{if(acquired){if(accountSwitches.has(name))switchingAccount=false;else activeOperations--;}}
});}
async function switchAccount(action){
  const previous=accounts.state().user?.id||null;
  try{await action();const next=new Store(accounts.libraryDir());store=next;metadata.matches.clear();return state();}
  catch(error){accounts.restoreSession(previous);throw error;}
}
function imagePng(bytes,maxSide){
  const source=nativeImage.createFromBuffer(bytes);
  if(source.isEmpty())throw new Error('图片无法读取，请选择 PNG、JPG 或 WebP 图片。');
  const {width,height}=source.getSize();
  if(width>16000||height>16000)throw new Error('图片尺寸过大，请缩小后重试。');
  const scale=Math.min(1,maxSide/Math.max(width,height));
  return source.resize({width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),quality:'good'}).toPNG();
}
function assertFile(p,label){if(!p||!fs.existsSync(p)||!fs.statSync(p).isFile())throw new Error(label+'不存在，请编辑游戏并重新选择。');}
async function chooseGame(defaultPath){const r=await dialog.showOpenDialog(mainWindow,{title:'选择游戏启动文件',defaultPath,properties:['openFile'],filters:[{name:'游戏启动文件',extensions:['exe','lnk','bat','cmd']}]});return r.canceled?null:r.filePaths[0];}
function checkpoint(id){const active=processes.get(id);if(!active)return;const now=Date.now();store.addPlayTime(id,(now-active.checkpoint)/1000);active.checkpoint=now;}
function completeProcess(id){checkpoint(id);processes.delete(id);}
async function launchGame(id){
  if(launching.has(id)||processes.has(id))throw new Error('这个游戏正在启动或运行。');
  launching.add(id);
  try{return await launchInner(id);}finally{launching.delete(id);}
}
async function launchInner(id){
  if(processes.has(id))throw new Error('这个游戏正在运行。');
  let g=store.findGame(id);
  if(!g.exePath||!fs.existsSync(g.exePath)) {
    const selected=await chooseGame(g.legacyFolder||path.dirname(g.exePath||store.dir));
    if(!selected)return {ok:false,canceled:true};
    store.saveGame({...g,exePath:selected,workDir:path.dirname(selected)});g=store.findGame(id);
  }
  assertFile(g.exePath,'游戏启动文件');
  const ext=path.extname(g.exePath).toLowerCase();
  if(ext!=='.exe'){
    if(g.args.length||g.launchMode==='locale')throw new Error('启动参数与转区模式需要直接选择 EXE 文件。');
    const err=await shell.openPath(g.exePath);if(err)throw new Error('启动失败：'+err);
    store.markLaunch(id);return {ok:true,tracking:false};
  }
  let executable=g.exePath,args=g.args||[];
  let cwd=g.workDir||path.dirname(g.exePath);
  if(!fs.existsSync(cwd)||!fs.statSync(cwd).isDirectory())throw new Error('工作目录不存在，请编辑游戏修正。');
  if(g.launchMode==='locale'){
    const candidates=[store.data.settings.localeEmulatorPath,store.data.settings.legacyRoot?path.join(store.data.settings.legacyRoot,'resources','le','LEProc.exe'):null];
    executable=candidates.find(p=>p&&fs.existsSync(p));if(!executable)throw new Error('未找到 Locale Emulator，请在设置中选择 LEProc.exe，或改为普通启动。');
    args=g.localeGuid?['-runas',g.localeGuid,g.exePath,...args]:['-run',g.exePath,...args];
  }
  const child=spawn(executable,args,{cwd,detached:true,stdio:'ignore',windowsHide:false,shell:false});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',e=>reject(new Error('启动失败：'+e.message)));});
  if(g.launchMode==='locale') {child.on('error',()=>{});child.unref();store.markLaunch(id);return {ok:true,tracking:false};}
  processes.set(id,{child,checkpoint:Date.now()});
  const finish=()=>{if(processes.get(id)?.child===child)completeProcess(id);};
  child.once('exit',finish);child.once('error',finish);child.unref();
  store.markLaunch(id);return {ok:true,tracking:true};
}
function registerApi(){
  handle('getState',state);
  handle('registerAccount',request=>switchAccount(()=>accounts.register(request)));
  handle('loginAccount',request=>switchAccount(()=>accounts.login(request)));
  handle('logoutAccount',()=>switchAccount(()=>accounts.logout()));
  handle('updateProfile',request=>{accounts.updateProfile({displayId:request?.displayId});return state();});
  handle('chooseAvatar',async()=>{
    if(!accounts.state().user)throw new Error('请先登录本地账户。');
    const result=await dialog.showOpenDialog(mainWindow,{title:'选择本地头像',properties:['openFile'],filters:[{name:'头像图片',extensions:['png','jpg','jpeg','webp']}]});
    if(result.canceled)return state();
    if(fs.statSync(result.filePaths[0]).size>5*1024*1024)throw new Error('头像文件不能超过 5 MB。');
    accounts.updateProfile({avatarPng:imagePng(fs.readFileSync(result.filePaths[0]),256)});return state();
  });
  handle('removeAvatar',()=>{accounts.updateProfile({avatarPng:null});return state();});
  handle('chooseGameFolder',async()=>{
    const result=await dialog.showOpenDialog(mainWindow,{title:'选择本机游戏文件夹',properties:['openDirectory']});
    return result.canceled?null:scanGameFolder(result.filePaths[0]);
  });
  handle('searchMetadata',query=>metadata.search(query));
  handle('metadataCover',async request=>{
    const bytes=await metadata.downloadCover(request?.id);if(!bytes)return {coverPath:''};
    const png=imagePng(bytes,1200),file=path.join(store.coverDir,crypto.createHash('sha256').update(png).digest('hex').slice(0,24)+'.png');
    fs.writeFileSync(file,png);return {coverPath:file};
  });
  handle('saveGame',g=>store.saveGame(g));
  handle('deleteGame',id=>{if(processes.has(id)||launching.has(id))throw new Error('请先关闭游戏，再从库中移除。');return store.deleteGame(id);});
  handle('saveCategory',c=>store.saveCategory(c));
  handle('deleteCategory',id=>store.deleteCategory(id));
  handle('saveSettings',p=>store.saveSettings(p));
  handle('launchGame',launchGame);
  handle('openGameFolder',async id=>{const g=store.findGame(id);const dir=g.exePath?path.dirname(g.exePath):g.legacyFolder;if(!dir||!fs.existsSync(dir))throw new Error('游戏目录不存在，请编辑游戏路径。');const error=await shell.openPath(dir);if(error)throw new Error(error);});
  handle('openDataFolder',async()=>{const err=await shell.openPath(store.dir);if(err)throw new Error(err);});
  handle('pickFile',async options=>{
    if(options?.kind==='game')return chooseGame();
    if(!['folder','cover'].includes(options?.kind))throw new Error('不支持的文件选择类型。');
    const r=await dialog.showOpenDialog(mainWindow,{title:options.kind==='folder'?'选择目录':'选择封面',properties:[options.kind==='folder'?'openDirectory':'openFile'],...(options.kind==='cover'?{filters:[{name:'封面图片',extensions:['png','jpg','jpeg','webp','gif','bmp','avif']}]}:{})});return r.canceled?null:r.filePaths[0];
  });
  handle('exportBackup',async()=>{
    const r=await dialog.showSaveDialog(mainWindow,{title:'导出游戏库备份（包含封面）',defaultPath:path.join(app.getPath('documents'),'galshelf-'+new Date().toISOString().slice(0,10)+'.json'),filters:[{name:'galshelf 备份',extensions:['json']}]});
    if(r.canceled)return null;store.exportBackup(r.filePath);return r.filePath;
  });
  handle('importBackup',async()=>{
    const r=await dialog.showOpenDialog(mainWindow,{title:'合并导入 galshelf 备份',filters:[{name:'galshelf 备份',extensions:['json']}],properties:['openFile']});
    if(r.canceled)return null;return store.importBackup(r.filePaths[0]);
  });
  handle('openSite',async request=>{
    await shell.openExternal(siteUrl(request?.id,request?.query));
  });
  handle('openArchiveTool',async id=>{await shell.openExternal(archiveToolUrl(id));});
}
if(ownsInstance)app.whenReady().then(async()=>{
  try {
    const persistentDir=prepareDataDirectory(storage.library,storage.migrate?legacyDataDir:null);
    accounts=new Accounts(persistentDir);
    store=new Store(accounts.libraryDir());
    metadata=new Metadata({fetchImpl:net.fetch.bind(net)});
    session.defaultSession.setPermissionRequestHandler((_wc,_perm,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    registerApi();
    mainWindow=new BrowserWindow({width:1380,height:920,minWidth:1000,minHeight:720,show:false,icon:path.join(__dirname,'assets','icon.png'),backgroundColor:'#15131c',title:'galshelf',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    mainWindow.webContents.on('will-navigate',e=>e.preventDefault());
    mainWindow.once('ready-to-show',()=>{if(!smoke)mainWindow.show();});
    await mainWindow.loadFile(mainHtml);
    setInterval(()=>{for(const id of processes.keys())checkpoint(id);},60000).unref();
    if(smoke){await require('./test/smoke-runner')({app,window:mainWindow,store,launchGame,accounts,metadata});}
  } catch(e){if(smoke){console.error(e.stack);app.exit(1);}else {dialog.showErrorBox('galshelf 启动失败',e.message);app.quit();}}
});
app.on('before-quit',()=>{if(store)for(const id of processes.keys())checkpoint(id);});
app.on('window-all-closed',()=>app.quit());
