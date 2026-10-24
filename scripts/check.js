'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=['main.js','preload.js','build.js'];
for(const dir of ['lib','src','scripts','test'])for(const file of fs.readdirSync(path.join(root,dir)))if(file.endsWith('.js'))files.push(path.join(dir,file));
for(const file of files){const result=spawnSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status||1);}
console.log('Syntax checked: '+files.length+' JavaScript files.');
