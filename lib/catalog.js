'use strict';

// Only these reviewed links can be opened by the renderer. No remote page is embedded.
const SITES = [
  {id:'vndb',name:'VNDB',description:'视觉小说资料库，查询作品、制作组、发行版本与标签。',home:'https://vndb.org/',searchTemplate:'https://vndb.org/v?q={query}',kind:'资料库',language:'English'},
  {id:'bangumi',name:'Bangumi 番组计划',description:'中文游戏条目、评分、讨论与收藏记录，搜索限定游戏。',home:'https://bgm.tv/game',searchTemplate:'https://bgm.tv/subject_search/{query}?cat=4',kind:'资料库',language:'中文'},
  {id:'gog',name:'GOG',description:'查询 DRM-free 游戏与视觉小说。收录范围和地区可用性以商店为准。',home:'https://www.gog.com/en/games',searchTemplate:'https://www.gog.com/en/games?query={query}',kind:'商店',language:'多语言'},
  {id:'itch',name:'itch.io',description:'发现独立视觉小说、短篇作品和试玩版。搜索限定游戏。',home:'https://itch.io/games/tag-visual-novel',searchTemplate:'https://itch.io/search?q={query}&type=games',kind:'独立游戏',language:'English'},
  {id:'vlink',name:'VLink 导航',description:'张小君的个人导航页，收录游戏、实用工具等网站入口。',home:'https://vlink.cc/0d000721',kind:'网站导航',language:'中文'}
];
const ARCHIVE_TOOLS = [
  {id:'unisunzip',name:'解压专家',description:'UNISAPPS 的 Windows 文件解压与管理工具，支持 ZIP、7z、RAR 和分卷压缩包。',home:'https://www.unisapps.com/',kind:'图形解压工具',license:'授权与付费功能以官方页面为准',platform:'Windows',sourceLabel:'UNISAPPS 官方网站'},
  {id:'winrar',name:'WinRAR',description:'处理 RAR、ZIP 及分卷压缩包；在官方下载页选择所需语言和 Windows 版本。',home:'https://www.rarlab.com/download.htm',kind:'压缩与解压',license:'提供 40 天试用，之后继续使用需购买许可',platform:'Windows',sourceLabel:'RARLAB 官方下载页'},
  {id:'7zip',name:'7-Zip',description:'免费开源压缩工具，支持创建 7z、ZIP 压缩包，以及解压 RAR 等常见格式。',home:'https://www.7-zip.org/download.html',kind:'压缩与解压',license:'免费开源；主要使用 GNU LGPL，部分代码另有许可',platform:'Windows',sourceLabel:'7-Zip 官方下载页'}
];

function siteUrl(id, query = '') {
  const site=SITES.find(item=>item.id===id);
  if(!site)throw new Error('搜索网站不存在。');
  const text=typeof query==='string'?query.trim().slice(0,500):'';
  return text&&site.searchTemplate?site.searchTemplate.replace('{query}',encodeURIComponent(text)):site.home;
}
function archiveToolUrl(id) {
  const tool=ARCHIVE_TOOLS.find(item=>item.id===id);
  if(!tool)throw new Error('解压工具不存在。');
  return tool.home;
}
module.exports={SITES,ARCHIVE_TOOLS,siteUrl,archiveToolUrl};
