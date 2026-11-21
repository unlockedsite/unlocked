// Client-only QoL utilities. No third-party calls or game-frame instrumentation.
const key = name => "unlocked.qol."+name;
export function read(name,fallback){try{return JSON.parse(localStorage.getItem(key(name)))??fallback}catch{return fallback}}
export function write(name,value){try{localStorage.setItem(key(name),JSON.stringify(value))}catch{}}
export function historyEntry(game){
  const items=read("history",[]).filter(x=>x&&x.id!==game.id);
  items.unshift({id:game.id,last:Date.now(),visits:(read("history",[]).find(x=>x.id===game.id)?.visits||0)+1});
  write("history",items.slice(0,100));
}
export function trackReceipt(game,receipt){
  const list=read("receipts",[]);list.unshift({game,receipt,date:Date.now(),status:"Submitted"});
  write("receipts",list.slice(0,50));
}
export function folders(){const list=read("folders",{"Favorites":[]});return list&&typeof list==="object"&&!Array.isArray(list)?list:{"Favorites":[]}}
export function storeFolder(name,ids){const all=folders();all[name]=[...new Set(ids)].slice(0,500);write("folders",all)}
export function removeFolder(name){const all=folders();if(name==="Favorites")return;delete all[name];write("folders",all)}
export function searchScore(game,query){
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const term=norm(query),title=norm(game.title),alias=(game.aliases||[]).map(norm);
  if(!term)return 0;
  if(title===term||alias.includes(term))return 100;
  if(title.startsWith(term)||alias.some(x=>x.startsWith(term)))return 80;
  if(title.includes(term)||alias.some(x=>x.includes(term)))return 60;
  const words=String(game.title).toLowerCase().split(/\W+/);
  if(words.map(w=>w[0]).join("")===term)return 55;
  return 0;
}
export function safeCopy(value){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(value);return Promise.reject(Error("Copy unavailable"))}
