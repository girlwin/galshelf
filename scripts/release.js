'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {build}=require('../build');
const manifest=require('../package.json');
async function release(){
  const out=path.resolve(process.argv[2]||path.join(__dirname,'..','release'));
  const folder=await build(out);
  const filename=`galshelf-${manifest.version}-win32-x64.zip`;
  const zip=path.join(out,filename);
  // Pass paths as environment values, never interpolate them as shell code.
  const command="$ErrorActionPreference='Stop'; [void][System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem'); [System.IO.Compression.ZipFile]::CreateFromDirectory($env:GALSHELF_RELEASE_FOLDER, $env:GALSHELF_RELEASE_ZIP, [System.IO.Compression.CompressionLevel]::Optimal, $true)";
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{stdio:'inherit',windowsHide:true,env:{...process.env,GALSHELF_RELEASE_FOLDER:folder,GALSHELF_RELEASE_ZIP:zip}});
  if(result.error||result.status!==0)throw result.error||new Error('ZIP creation failed.');
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(zip))hash.update(chunk);
  fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),hash.digest('hex')+'  '+filename+'\n');
  console.log(JSON.stringify({zip,checksums:path.join(out,'SHA256SUMS.txt')}));
}
release().catch(error=>{console.error(error.message);process.exitCode=1;});
