'use strict';
const {packager}=require('@electron/packager');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const manifest=require('./package.json');
const {stageRuntime}=require('./lib/distribution');
async function build(out=path.join(__dirname,'release')){
  if(process.platform!=='win32')throw new Error('Windows builds require Windows. Use the included GitHub Actions workflow.');
  out=path.resolve(out);
  if(out===__dirname||out===path.parse(out).root)throw new Error('Choose a dedicated release output directory.');
  const destination=path.join(out,'galshelf-win32-x64');
  if(fs.existsSync(destination))throw new Error('Build folder already exists: '+destination+'. Move the previous build before rebuilding.');
  const staging=fs.mkdtempSync(path.join(os.tmpdir(),'galshelf-build-'));
  try{
    execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'scripts','build-capture.ps1')],{stdio:'inherit',windowsHide:true});
    stageRuntime(__dirname,staging,manifest);
    const result=await packager({dir:staging,out,name:'galshelf',platform:'win32',arch:'x64',electronVersion:require('electron/package.json').version,asar:{unpack:'**/*.exe'},prune:false,icon:path.join(staging,'assets','icon.ico'),win32metadata:{CompanyName:'galshelf contributors',FileDescription:'galshelf',ProductName:'galshelf'},overwrite:false});
    const electronLicense=path.join(path.dirname(require.resolve('electron/package.json')),'LICENSE');
    for(const folder of result){
      // The project's LICENSE must not replace the runtime's copyright notice.
      fs.copyFileSync(electronLicense,path.join(folder,'LICENSE.electron.txt'));
      for(const file of ['README.md','LICENSE','LICENSE-GALSHELF-MIT.txt','LICENSE-MEGULIT-GPL-3.0.txt','THIRD-PARTY-MEGULIT.txt'])fs.copyFileSync(path.join(staging,file),path.join(folder,file));
    }
    return result[0];
  }finally{
    // Clean only the new temporary directory after checking its resolved location.
    if(path.dirname(staging)===path.resolve(os.tmpdir())&&path.basename(staging).startsWith('galshelf-build-'))fs.rmSync(staging,{recursive:true,force:true});
  }
}
if(require.main===module)build(process.argv[2]).then(folder=>console.log(JSON.stringify({folder}))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={build};
