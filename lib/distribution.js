'use strict';
const fs=require('node:fs');
const path=require('node:path');

// Deliberately list individual shipped files. Never recursively copy a source
// directory: a developer may have placed private user data anywhere inside it.
const RUNTIME_FILES=Object.freeze([
  'main.js','preload.js','README.md','LICENSE',
  'src/index.html','src/renderer.js','src/style.css',
  'lib/store.js','lib/catalog.js','lib/accounts.js','lib/discovery.js','lib/metadata.js',
  'assets/icon.png','assets/icon.ico'
]);
const RUNTIME_MANIFEST_FIELDS=Object.freeze(['name','productName','version','description','main','license']);

function regularSourceFile(root,relative){
  let current=root;
  const segments=relative.split('/');
  for(let index=0;index<segments.length;index++){
    current=path.join(current,segments[index]);
    const stat=fs.lstatSync(current);
    if(stat.isSymbolicLink()||(index===segments.length-1?!stat.isFile():!stat.isDirectory()))throw new Error('Release source must be a regular file without linked parents: '+relative);
  }
  return current;
}

function auditRuntime(root){
  const expected=new Set([...RUNTIME_FILES,'package.json']);
  const found=[];
  function visit(relative=''){
    for(const name of fs.readdirSync(path.join(root,relative))){
      const item=relative?relative+'/'+name:name;
      const stat=fs.lstatSync(path.join(root,item));
      if(stat.isSymbolicLink())throw new Error('Linked release entry: '+item);
      if(stat.isDirectory()){
        if(![...expected].some(file=>file.startsWith(item+'/')))throw new Error('Unexpected release directory: '+item);
        visit(item);
      }else if(stat.isFile()&&expected.has(item))found.push(item);
      else throw new Error('Unexpected release file: '+item);
    }
  }
  visit();
  for(const file of expected)if(!found.includes(file))throw new Error('Missing release file: '+file);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if(Object.keys(manifest).some(key=>!RUNTIME_MANIFEST_FIELDS.includes(key))||manifest.main!=='main.js')throw new Error('Unexpected release manifest configuration.');
  return found.sort();
}

function stageRuntime(source,destination,manifest){
  source=path.resolve(source);destination=path.resolve(destination);
  if(source===destination)throw new Error('Release staging must be separate from source.');
  if(fs.existsSync(destination)){
    if(fs.lstatSync(destination).isSymbolicLink()||!fs.statSync(destination).isDirectory()||fs.readdirSync(destination).length)throw new Error('Release staging directory must be empty and unlinked.');
  }else fs.mkdirSync(destination,{recursive:true});
  // Validate every source before writing anything to staging.
  const files=RUNTIME_FILES.map(file=>[file,regularSourceFile(source,file)]);
  for(const [relative,file] of files){
    const target=path.join(destination,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(file,target);
  }
  const runtimeManifest={};
  for(const field of RUNTIME_MANIFEST_FIELDS)if(manifest[field]!==undefined)runtimeManifest[field]=manifest[field];
  fs.writeFileSync(path.join(destination,'package.json'),JSON.stringify(runtimeManifest,null,2)+'\n');
  return auditRuntime(destination);
}

module.exports={RUNTIME_FILES,stageRuntime,auditRuntime};
