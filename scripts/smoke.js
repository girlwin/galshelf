'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn,spawnSync}=require('node:child_process');
async function smoke(){
  if(process.platform!=='win32')throw new Error('The native launcher smoke test requires Windows.');
  const root=path.resolve(__dirname,'..');
  const testDir=fs.mkdtempSync(path.join(os.tmpdir(),'galshelf-smoke-'));
  const framework=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  const fixture=path.join(testDir,'TestGame.exe');
  const compile=spawnSync(framework,['/nologo','/target:winexe','/out:'+fixture,path.join(root,'test','TestGame.cs')],{stdio:'inherit',windowsHide:true});
  if(compile.error||compile.status!==0)throw compile.error||new Error('Could not compile the local test fixture.');
  // Exercise first launch with a custom data directory that does not exist yet.
  const dataDir=path.join(testDir,'new-library');
  const env={...process.env,GALSHELF_DATA_DIR:dataDir,GALSHELF_TEST_GAME:fixture};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[root,'--smoke-test'],{env,stdio:'inherit',windowsHide:true});
  const timeout=setTimeout(()=>child.kill(),60000);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timeout);
  const reportPath=path.join(dataDir,'smoke-result.json');
  if(!fs.existsSync(reportPath))throw new Error('Smoke test did not produce a result. Diagnostics: '+testDir);
  const result=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  if(code!==0||!result.ok)throw new Error(result.error||'Smoke test failed.');
  console.log('Smoke test passed. Diagnostics: '+testDir);
}
smoke().catch(error=>{console.error(error.stack);process.exitCode=1;});
