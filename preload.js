'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const api={};
for(const method of ['getState','saveGame','deleteGame','saveCategory','deleteCategory','launchGame','openGameFolder','pickFile','chooseGameFolder','searchMetadata','metadataCover','importBackup','exportBackup','openSite','openArchiveTool','openDataFolder','saveSettings','registerAccount','loginAccount','logoutAccount','updateProfile','chooseAvatar','removeAvatar'])api[method]=async(...args)=>{const result=await ipcRenderer.invoke('gal:'+method,...args);if(result?.__error)throw new Error(result.__error);return result;};
contextBridge.exposeInMainWorld('gal',api);
