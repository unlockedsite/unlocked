import { icon } from "./icons.mjs?v=5";
import { matches, normalize } from "./search.mjs";
import * as qol from "./qol.mjs?v=1";
import * as hub from "./hub.mjs?v=4";
import { chromeOS, createPlayer } from "./player.mjs?v=7";

const $ = selector => document.querySelector(selector);
const main = $("#content"), search = $("#search"), guide = $("#guide");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const relativeAsset = id => "./assets/covers/" + encodeURIComponent(id) + ".webp";
const posterAsset = id => "./assets/posters/" + encodeURIComponent(id) + ".webp";
const featured = ["geometry-dash", "60-seconds", "repo"];
let featureIndex = 0;
const levels = { low: "Low", medium: "Medium", high: "High" };
const levelTips = { low: "Lightweight, targets around 60 FPS.", medium: "Moderate load, targets around 30 FPS.", high: "Demanding. May struggle or fail on an entry-level Chromebook." };
const categories = { loading:"Game won’t load", performance:"Slow or choppy", controls:"Controls", fullscreen:"Fullscreen", sound:"Audio", other:"Something else" };
const collate = new Intl.Collator("en", {numeric:true, sensitivity:"base", ignorePunctuation:true});
const dl = (key, fallback, session = false) => {
  try { return (session ? sessionStorage : localStorage).getItem("unlocked."+key) ?? fallback; } catch { return fallback; }
};
function saveValue(key, value, session=false) {
  try {(session?sessionStorage:localStorage).setItem("unlocked."+key,value);} catch { /* In-memory state remains usable. */ }
}
function savedIds() {
  try {const list=JSON.parse(dl("saved","[]"));return new Set(Array.isArray(list)?list.filter(id=>typeof id==="string"):[]);} catch{return new Set();}
}
const saved = savedIds();
let games = [], byId = new Map(), genre = "", level = "", q = "", navigation = 0;
let current = {page:"library",id:"",params:new URLSearchParams()}, tourStep=0, toastTimer;
let inviteHidden=dl("tour","")==="seen";
let currentLaunch=null, searchMessage="";

let playSession=null, player=null, launchCatalog;
let recentGames=[];
let performanceMode=qol.read("performance",false);
let healthReports=qol.read("health",{});
let selectedFolder="All";
let rouletteTimer=null, rouletteWinner=null;
let sortMode="az";
let playedIds=new Set(qol.read("history",[]).map(h=>h.id));
let sessionTicker=null;
try {
  const stored=JSON.parse(dl("recent","[]"));
  if(Array.isArray(stored))recentGames=[...new Set(stored.filter(id=>typeof id==="string"))].slice(0,4);
} catch { /* Ignore invalid saved history. */ }


const pageSize = 48;
let visibleCount = pageSize;
let availability = "play";
const alphabetical = (a,b) => collate.compare(a.title,b.title);
const bookmarkText = id => saved.has(id) ? "Saved" : "Save game";
const savedClass = id => saved.has(id) ? " active-save" : "";
const feedback = (selector, msg) => {const tag=$(selector);if(tag) tag.textContent=msg;};
const btn = (action, label, glyph, cls="secondary-btn") => '<button type="button" class="'+cls+'" data-action="'+action+'">'+(glyph?icon(glyph):"")+esc(label)+'</button>';

function toast(msg){clearTimeout(toastTimer);$("#toast").textContent=msg;toastTimer=setTimeout(()=>{$("#toast").textContent="";},2400);}
function readRoute(){
  const [path,query=""] = location.hash.slice(1).replace(/^\//,"").split("?");
  const [slug="library",id=""] = path.split("/");
  const page=slug || "library";
  return {page,id,params:new URLSearchParams(query)};
}
function setNav(){
  document.querySelectorAll(".primary-nav a").forEach(a=>{
    if(a.dataset.page===current.page || (a.dataset.page==="library" && current.page==="search")) a.setAttribute("aria-current","page");
    else a.removeAttribute("aria-current");
  });
}
function specBadge(key){
  return '<span class="load load-'+key+'" title="'+esc(levelTips[key])+'"><span class="meter" aria-hidden="true"><i></i><i></i><i></i></span>'+levels[key]+'<span class="sr-only"> hardware demand estimate</span></span>';
}
function ageGuide(g){
  // Unofficial genre/content guidance, not ESRB/PEGI or a verified age classification.
  const text=(g.title+" "+g.genre+" "+(g.description||"")).toLowerCase();
  if(/horror|survival horror|blood|gore|violent|shooter|combat|war|zombie|murder|killer|fnaf|doom|resident evil|silent hill/.test(text))return {label:"16+",reason:"Potentially intense or violent themes"};
  if(/puzzle|platform|arcade|racing|sports|rhythm|idle|clicker|casual|music|kart|tetris/.test(text))return {label:"7+",reason:"Typically lighter gameplay themes"};
  return {label:"13+",reason:"Content has not been individually verified"};
}
function ageBadge(g){
 const rating=ageGuide(g);
 return '<span class="age-guide" tabindex="0" aria-label="Unofficial age guidance '+rating.label+'" title="Unofficial age guidance: '+rating.label+' — '+esc(rating.reason)+'. Not an ESRB or PEGI rating.">'+rating.label+'<span class="age-tooltip">'+esc(rating.reason)+' · Unofficial estimate, not an ESRB/PEGI rating</span></span>';
}
function bookmark(id,compact=false,hero=false){
  const active=saved.has(id), name=byId.get(id)?.title || "game";
  return '<button type="button" data-save="'+esc(id)+'" aria-pressed="'+active+'" title="'+(active?"Remove from saved":"Save game")+'" aria-label="'+esc((active?"Remove ":"Save ")+name+(active?" from saved":""))+'" class="'+(compact?"save-mini":hero?"ghost-btn":"secondary-btn")+savedClass(id)+'">'+icon("bookmark")+(compact?"":"<span>"+bookmarkText(id)+"</span>")+'</button>';
}
function poster(g) {
  return '<img src="'+posterAsset(g.id)+'" alt="" width="320" height="480" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
}
function playStatus(g) {
  return g.mode === "embed" ? '' : '<span>In-page play unavailable</span>';
}
function moreButton(total) {
  return total > visibleCount ? '<div class="more-games">'+btn("show-more","Show more games",null)+'</div>' : "";
}
function card(g, {rank=0,count=0}={}) {
  const title=esc(g.title);
  const health=healthReports[g.id];
  const healthBadge=health==="issue"?'<span class="qol-health" title="Personal flag on this device; not a verified outage">My flag</span>':"";
  const starts=false?'<span class="poster-plays">'+playtime(count)+'</span>':'';
  return '<article class="card"><a href="#/game/'+g.id+'" aria-label="'+title+'"><div class="cover">'+poster(g)+specBadge(g.load)+ageBadge(g)+healthBadge+(rank?'<span class="rank">#'+rank+'</span>':'')+'</div><div class="card-copy"><span class="poster-genre">'+esc(g.genre)+'</span><h3>'+title+'</h3><div class="poster-numbers">'+playStatus(g)+starts+'</div></div></a>'+(playedIds.has(g.id)?'<span class="qol-visited" title="Played before">Played</span>':'')+bookmark(g.id,true)+'</article>';
}
const grid = (rows) => '<div class="grid">'+rows.map(g=>card(g)).join("")+'</div>';
const titleBar = (tag,title,count,aside="") => '<div class="shelf-head"><div class="shelf-title"><'+tag+'>'+esc(title)+'</'+tag+'><span class="count" aria-label="'+count+' games">'+count+'</span></div>'+aside+'</div>';
function filters(){
  const quick=["","Action","Adventure","Horror","RPG","Simulation"];
  const all=[...new Set(games.map(g=>g.genre))].sort(collate.compare);
  const select = (id, label, options) => '<span class="selectbox"><select class="filter-select" id="'+id+'" aria-label="'+label+'">'+options+'</select>'+icon("chevron")+'</span>';
  return '<div class="filters" aria-label="Game filters">'+quick.map(g=>'<button class="chip" data-genre="'+g+'" aria-pressed="'+(g===genre)+'">'+(g || "All genres")+'</button>').join("")+
    select("availability","Game availability",[["play","Ready to play"],["all","All catalog games"],["listed","Awaiting a build"]].map(([v,label])=>'<option value="'+v+'" '+(availability===v?"selected":"")+'>'+label+'</option>').join(""))+
    select("more-genres","More genres",'<option value="" '+(quick.includes(genre)?"selected":"")+'>More genres</option>'+all.filter(g=>!quick.includes(g)).map(g=>'<option '+(g===genre?"selected ":"")+'value="'+esc(g)+'">'+esc(g)+'</option>').join(""))+
    '<span class="spec-control">'+select("demand","Chromebook hardware demand",'<option value="">Any spec</option>'+Object.keys(levels).map(k=>'<option '+(level===k?"selected ":"")+'value="'+k+'">'+levels[k]+' spec</option>').join(""))+
    '<button class="spec-help" data-action="specs" title="What do the spec labels mean?" aria-label="Explain spec estimates">'+icon("info")+'</button></span></div>';
}
function hero(){
  const g = byId.get(featured[featureIndex]);
  const image = "./assets/featured/"+g.id+".webp";
  const bars = featured.map((id,i)=>'<button type="button" class="feature-bar" data-feature="'+i+'" aria-label="Show '+esc(byId.get(id).title)+'" aria-pressed="'+(i===featureIndex)+'"><span><i></i></span></button>').join("");
  return '<section class="hero" aria-label="Featured game"><img class="hero-bg" src="'+image+'" alt=""><div class="hero-body"><div class="eyebrow feature-tag">'+icon("star")+'Featured game</div><h1>'+esc(g.title)+'</h1><p>'+esc(g.description || "Gather supplies and guide your family through life in a fallout shelter.")+'</p><div class="actions"><a class="btn" href="#/game/'+g.id+'?start=1">'+icon("play")+'Play game</a>'+bookmark(g.id,false,true)+'</div></div><div class="feature-bars" role="group" aria-label="Featured games">'+bars+'</div></section>';
}
function nextFeature(index = (featureIndex + 1) % featured.length){
  const old = $(".spotlight .hero");
  if (!old) return;
  const refocus = document.activeElement?.closest(".feature-bar") && old.contains(document.activeElement);
  featureIndex = index;
  old.querySelector(".feature-outgoing")?.remove();
  old.insertAdjacentHTML("afterend", hero());
  const slide = old.nextElementSibling;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    old.remove();
  } else {
    old.inert = true;
    old.setAttribute("aria-hidden", "true");
    old.classList.add("feature-outgoing");
    Object.assign(old.style, {position:"absolute", inset:"0", minHeight:"0", zIndex:"2", pointerEvents:"none", border:"0"});
    slide.append(old);
    const fade = old.animate([{opacity:1},{opacity:0}], {duration:700, easing:"ease-in-out", fill:"forwards"});
    fade.finished.then(()=>old.remove(), ()=>old.remove());
  }
  if (refocus) slide.querySelector('.feature-bar[aria-pressed="true"]').focus({preventScroll:true});

}
function extraTools(){return '<div class="qol-bar hub-extra-tools"><a class="secondary-btn" href="#/compare">'+icon("grid")+' Compare games</a><button class="secondary-btn" data-action="random-genre">'+icon("star")+' Random genre</button></div>'}
function comparePage(){
 const ready=games.filter(g=>g.mode==="embed");
 const opts=ready.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.title)+'</option>').join("");
 main.innerHTML='<section class="section-page hub-page"><h1>Compare games</h1><p class="subcopy">Compare genres and approximate Chromebook hardware demand.</p><div class="qol-bar"><label>Game 1 <select id="compare-one">'+opts+'</select></label><label>Game 2 <select id="compare-two">'+opts+'</select></label></div><div id="compare-result"></div></section>';
 if(ready.length>1)document.querySelector("#compare-two").selectedIndex=1;
 updateCompare();
}
function updateCompare(){
 const a=byId.get(document.querySelector("#compare-one")?.value),b=byId.get(document.querySelector("#compare-two")?.value),target=document.querySelector("#compare-result");
 if(!target)return;
 if(!a||!b){target.textContent="Choose two playable games.";return;}
 target.innerHTML='<div class="hub-feature-row">'+[a,b].map(g=>'<a class="hub-feature" href="#/game/'+esc(g.id)+'"><strong>'+esc(g.title)+'</strong><span>'+esc(g.genre)+' · '+esc(levels[g.load]||"Unknown")+' hardware demand</span><span>'+esc(g.description||"No description available")+'</span></a>').join("")+'</div>';
}
function qolBar(){
  return '<div class="qol-bar"><button class="secondary-btn" data-action="random-game">'+icon("play")+' Surprise me</button><button class="secondary-btn" data-action="performance">'+icon("bolt")+' '+(performanceMode?"Normal visuals":"Low graphics")+'</button><a class="secondary-btn" href="#/history">'+icon("clock")+' Play history</a><a class="secondary-btn" href="#/settings">'+icon("info")+' Settings</a></div>';
}
function stopRoulette(){if(rouletteTimer!==null){clearTimeout(rouletteTimer);rouletteTimer=null;}rouletteWinner=null;}
function randomGamePool(){return games.filter(g=>g.mode==="embed");}
function rouletteView(){
 stopRoulette();
 const pool=randomGamePool();
 if(!pool.length){toast("No playable games available");return;}
 const winner=pool[Math.floor(Math.random()*pool.length)];
 rouletteWinner=winner.id;
 // Predetermine the winner so the reel always stops on the highlighted center card.
 const count=34, chosen=27, reel=Array.from({length:count},(_,i)=>i===chosen?winner:pool[Math.floor(Math.random()*pool.length)]);
 const tiles=reel.map(g=>'<div class="roulette-tile"><img src="'+posterAsset(g.id)+'" alt="" loading="lazy" decoding="async"><strong>'+esc(g.title)+'</strong></div>').join("");
 displayDialog('<div class="roulette-panel"><div class="roulette-heading">'+icon("star")+'<h2 id="guide-title">Surprise me!</h2></div><p class="hint">Rolling through the game vault…</p><div class="roulette-window"><div class="roulette-marker" aria-hidden="true"></div><div class="roulette-reel">'+tiles+'</div></div><div class="roulette-result" aria-live="polite">Choosing your game…</div><div class="actions"><button class="secondary-btn" data-action="roulette-again" disabled>Roll again</button><button class="btn" data-action="roulette-play" disabled>Play game</button><button class="secondary-btn" data-action="close-guide">Close</button></div></div>');
 guide.classList.remove("guided");
 const reelEl=guide.querySelector(".roulette-reel");
 const tileWidth=144, gap=12;
 const distance=chosen*(tileWidth+gap);
 // A fixed card width keeps the landing accurate across mobile and desktop.
 const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches||performanceMode;
 if(reduce){reelEl.style.transform='translateX(calc(-72px - '+distance+'px))';}
 else requestAnimationFrame(()=>requestAnimationFrame(()=>{if(guide.open&&rouletteWinner===winner.id){reelEl.style.transition='transform 4100ms cubic-bezier(.12,.68,.08,1)';reelEl.style.transform='translateX(calc(-72px - '+distance+'px))';}}));
 rouletteTimer=setTimeout(()=>{
   rouletteTimer=null;
   if(!guide.open||rouletteWinner!==winner.id)return;
   const result=guide.querySelector(".roulette-result");
   if(result)result.innerHTML='<h3>'+esc(winner.title)+'</h3><p>'+esc(winner.description||"A game from the Unlocked vault.")+'</p><div class="roulette-meta">'+specBadge(winner.load)+ageBadge(winner)+'</div>';
   guide.querySelectorAll('[data-action="roulette-again"],[data-action="roulette-play"]').forEach(b=>b.disabled=false);
 },reduce?80:4250);
}
function renderHistory(){const rows=qol.read("history",[]).map(h=>({h,g:byId.get(h.id)})).filter(x=>x.g);main.innerHTML='<section class="section-page"><h1>Play history</h1><p class="subcopy">Stored on this device only.</p><div class="qol-bar">'+btn("clear-history","Clear history","close")+'</div><div class="qol-history">'+rows.map(({h,g})=>'<a href="#/game/'+esc(g.id)+'"><strong>'+esc(g.title)+'</strong><small>'+new Date(h.last).toLocaleDateString()+' · '+h.visits+' launches</small></a>').join("")+'</div></section>';}
function communityBar(){return '<div class="community-bar"><a class="join-discord" href="https://discord.gg/AezupBCtns" target="_blank" rel="noopener noreferrer">'+icon("discord")+'<span><small>Join us on</small><strong>Discord</strong></span>'+icon("forward")+'</a><a class="community-action community-request" href="#/requests">'+icon("plus")+'<span>Request a game</span>'+icon("forward")+'</a><a class="community-action community-takedown" href="#/takedown">'+icon("shield")+'<span>Takedown Request</span>'+icon("forward")+'</a></div>';}
const SUBMISSION_API="https://unlocked-arcade-service.persistingthoughts0.chatgpt.site";
async function submitCommunityForm(form,path,payload){
 const button=form.querySelector('button[type="submit"]'),status=form.querySelector('[role="status"]');
 button.disabled=true;button.textContent="Sending…";status.textContent="";
 try{
  const response=await fetch(SUBMISSION_API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),credentials:"omit",signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"The submission service is unavailable.");
  status.textContent=data.status==="found"?"This game is already in the vault.":data.status==="received"?"Submitted successfully to the team.":"Submission received.";
  if(data.status==="received")form.reset();
 }catch(error){status.textContent=error.name==="TimeoutError"?"The request timed out. Please try again.":error instanceof TypeError?"Unable to reach the submission service. Please try again later.":error.message;}
 finally{button.disabled=false;button.textContent=path==="/v1/requests"?"Send game request":"Submit takedown request";}
}
function requestsPage(){
 main.innerHTML='<section class="section-page narrow"><a class="back" href="#/library">'+icon("back")+'All games</a><h1>Request a game</h1><p class="subcopy">Suggest a game for the Unlocked vault. Requests are delivered to our team through Discord.</p><form id="request-form" class="form"><label for="request-title">Game title</label><input id="request-title" name="query" maxlength="80" minlength="2" required autocomplete="off" placeholder="Enter the game name"><button class="btn" type="submit">Send game request</button><p role="status" class="feedback" aria-live="polite"></p></form></section>';
}
function takedownPage(){
 const opts=games.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.title)+'</option>').join("");
 main.innerHTML='<section class="section-page narrow"><a class="back" href="#/library">'+icon("back")+'All games</a><h1>Takedown Request</h1><p class="subcopy">For rights holders and authorized representatives requesting review or removal of content. Submissions are delivered privately to the team through Discord.</p><form id="takedown-form" class="form"><label for="takedown-game">Game or content</label><select id="takedown-game" name="game" required><option value="">Select a game</option>'+opts+'</select><label for="takedown-reason">Reason for removal</label><textarea id="takedown-reason" name="reason" minlength="15" maxlength="1500" rows="6" required placeholder="Describe your rights and why this content should be removed."></textarea><button class="btn" type="submit">Submit takedown request</button><p role="status" class="feedback" aria-live="polite"></p></form><p class="hint">Submitting a request does not automatically remove content. Please do not include sensitive personal information.</p></section>';
}
function rankingCounts(){const counts={};for(const h of qol.read("history",[]))counts[h.id]=Number(h.visits)||0;return counts;}
function currentRanks(){const counts=rankingCounts();return games.filter(g=>g.mode==="embed").sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)||alphabetical(a,b));}
function rankingTabs(){return "";}
function continuePlaying(){
  const recent=recentGames.map(id=>byId.get(id)).filter(g=>g?.mode==="embed");
  if(!recent.length)return "";
  return '<section class="continue-playing" aria-labelledby="continue-title"><div class="shelf-head"><h2 id="continue-title">Continue Playing</h2></div><div class="recent-grid">'+recent.map(g=>'<a class="recent-game" href="#/game/'+g.id+'?start=1">'+poster(g)+'<span><strong>'+esc(g.title)+'</strong><small>Play again</small></span>'+icon("play")+'</a>').join("")+'</div></section>';
}
function hubHighlights(){
 const recommend=hub.recommended(games,saved),discovered=hub.discovered(games);
 return '<section class="hub-discover">'+(recommend.length?'<h2>Recommended for you</h2>'+grid(recommend.slice(0,4)):"")+(discovered.length?'<h2>Recently discovered</h2>'+grid(discovered.slice(0,4)):"")+'</section>';
}
function renderLibrary(){
  const searching=current.page==="search";
  const full=searching ? games.filter(g=>!q || matches(g,q) || qol.searchScore(g,q)>0).sort((a,b)=>qol.searchScore(b,q)-qol.searchScore(a,q)||alphabetical(a,b)) : games;
  let rows=full.filter(g=>(!genre || g.genre===genre)&&(!level || g.load===level) && (availability==="all" || (g.mode==="embed")===(availability==="play")));
 if(sortMode==="demand")rows.sort((a,b)=>(["low","medium","high"].indexOf(a.load)-["low","medium","high"].indexOf(b.load))||alphabetical(a,b));
 else if(sortMode==="recent"){const dates=new Map(qol.read("history",[]).map(x=>[x.id,x.last]));rows.sort((a,b)=>(dates.get(b.id)||0)-(dates.get(a.id)||0)||alphabetical(a,b));}
 else if(sortMode==="popular"){const counts=rankingCounts();rows.sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)||alphabetical(a,b));}
  const label=searching ? "Search results" : "Game library";
  const aside='<div class="shelf-aside"><label class="sort-label">Sort <select id="hub-sort"><option value="az" '+(sortMode==="az"?"selected":"")+'>A–Z</option><option value="demand" '+(sortMode==="demand"?"selected":"")+'>Hardware demand</option><option value="popular" '+(sortMode==="popular"?"selected":"")+'>Popularity</option><option value="recent" '+(sortMode==="recent"?"selected":"")+'>Recently played</option></select></label></div>';
  let html=searching?"":'<div class="spotlight">'+hero()+'</div>'+communityBar()+qolBar()+hubHighlights()+continuePlaying();
  html+=titleBar(searching?"h1":"h2",label,rows.length,aside)+filters();
  if(rows.length) html+=grid(rows.slice(0,visibleCount))+moreButton(rows.length);
  else if(full.length || !q) html+='<div class="empty">'+icon("filter")+'<h2>No games with those filters</h2><p>Clear filters to see every matching title.</p>'+btn("reset-filters","Clear filters","filter")+'</div>';
  else {
    const sent=false;
    html+='<div class="empty">'+icon("search")+'<h2>'+ "No games found" +'</h2><p>'+"There’s no match for “"+esc(q)+"”. You can suggest games in our Discord server."+'</p>'+
    '<a class="btn" href="https://discord.gg/AezupBCtns" target="_blank" rel="noopener noreferrer">Suggest on Discord</a>'+'<p class="feedback" role="status" id="request-feedback">'+esc(searchMessage)+'</p></div>';
  }
  main.innerHTML=html;
  
}
function renderSaved() {
  const groups=qol.folders();const rows=games.filter(g=>selectedFolder==="All"?saved.has(g.id):(groups[selectedFolder]||[]).includes(g.id));
  main.innerHTML='<section class="section-page">'+titleBar("h1","Saved games",rows.length)+'<div class="qol-bar"><label>Folder <select id="folder-select"><option>All</option>'+Object.keys(groups).map(name=>'<option value="'+esc(name)+'" '+(selectedFolder===name?'selected':'')+'>'+esc(name)+'</option>').join("")+'</select></label>'+btn("new-folder","New folder","plus")+(selectedFolder!=="All"?btn("add-to-folder","Add saved games","plus"):"")+(selectedFolder!=="All"&&selectedFolder!=="Favorites"?btn("delete-folder","Delete folder","close"):"")+'</div>'+(rows.length?'<div class="qol-bar">'+(selectedFolder==="All"?"":rows.map(g=>'<button class="secondary-btn" data-folder-remove="'+esc(g.id)+'">Remove '+esc(g.title)+'</button>').join(""))+'</div>'+grid(rows.slice(0,visibleCount))+moreButton(rows.length):'<div class="empty">'+icon("bookmark")+'<h2>Your saved shelf is empty</h2><p>Use the bookmark on a game to keep it here on this device.</p><a class="btn" href="#/library">Browse games</a></div>')+'</section>';
}
function drawTop(){const ranks=currentRanks();main.innerHTML='<section class="section-page"><h1>Most played on this device</h1><p class="subcopy">Based on launches stored in this browser, not a global leaderboard.</p>'+grid(ranks.slice(0,visibleCount))+moreButton(ranks.length)+'</section>';}
function scheduleChart(){}
function redrawSavedButtons(id){
  if(current.page==="saved"){renderSaved();return;}
  document.querySelectorAll('[data-save="'+id+'"]').forEach(el=>{
    el.outerHTML=bookmark(id,el.classList.contains("save-mini"),el.classList.contains("ghost-btn"));
  });
}
function rememberGame(id){
  if(!byId.has(id))return;
  if(saved.has(id))saved.delete(id);else saved.add(id);
  saveValue("saved",JSON.stringify([...saved]));redrawSavedButtons(id);
  toast(saved.has(id)?"Added to saved games":"Removed from saved games");
}
function rememberTour(){inviteHidden=true;saveValue("tour","seen");$(".tour-invite")?.remove();}
function displayDialog(html){
  $("#guide-body").innerHTML=html;
  if(!guide.open)guide.showModal();
}
const tourStops = [
  [".spotlight .hero", "Featured games", "Geometry Dash, 60 Seconds!, and R.E.P.O. rotate here. Select a progress bar to switch games, or choose Play game to jump in."],
  [".community-bar", "Community", "Join Discord, request a game, or submit a takedown request."],
  [".qol-bar", "Surprise Me and quick tools", "Open a game roulette, switch to Low graphics, or view your play history and settings."],
  [".filters", "Find a game for your device", "Choose a genre or Chromebook spec to narrow the library. Low-demand games are the lightest to run."],
  [".grid", "Game ratings and details", "Hover over or focus an age badge for an unofficial estimate. Hardware-demand badges give approximate Chromebook requirements."]
];
function positionSpotlight(){
  if(!guide.open || !guide.classList.contains("guided"))return;
  const box=$(tourStops[tourStep][0])?.getBoundingClientRect();
  if(!box)return;
  const frame=guide.querySelector(".tour-frame");
  Object.assign(frame.style,{top:box.top+"px",left:box.left+"px",width:box.width+"px",height:box.height+"px"});
  const height=guide.offsetHeight;
  const below=innerHeight-box.bottom, above=box.top;
  const top=below>=height+12 || below>=above ? box.bottom+10 : box.top-height-10;
  guide.style.top=Math.max(8,Math.min(innerHeight-height-8,top))+"px";
}
function guidePage(){
  const [selector,title,body]=tourStops[tourStep];
  const target=$(selector);
  if(!target){guide.close();return;}
  target.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches||performanceMode?"instant":"smooth"});
  guide.classList.add("guided");
  const last=tourStep===tourStops.length-1;
  displayDialog('<span class="tour-frame" aria-hidden="true"></span><small>Quick tour · '+(tourStep+1)+' of '+tourStops.length+'</small><h2 id="guide-title">'+title+'</h2><p>'+body+'</p><div class="actions">'+btn("close-guide","End tour",null,"tour-skip")+(tourStep?btn("previous-guide","Back","back"):"")+btn(last?"close-guide":"next-guide",last?"Done":"Next",null,"btn")+'</div>');
  requestAnimationFrame(()=>requestAnimationFrame(positionSpotlight));
  guide.querySelector(".btn").focus({preventScroll:true});
}
function offerTour(){
  if(inviteHidden)return;
  rememberTour();
  displayDialog('<h2 id="guide-title">Want a quick tour?</h2><p>See where to play featured games, request a favorite, and find games for your device.</p><div class="actions">'+btn("close-guide","No thanks",null,"tour-skip")+btn("tour","Show me around",null,"btn")+'</div>');
}
guide.addEventListener("close",()=>{stopRoulette();guide.classList.remove("guided");guide.style.top="";});
window.addEventListener("resize",positionSpotlight);
window.addEventListener("scroll",positionSpotlight,{passive:true});
function showSpecs(){
  displayDialog('<h2 id="guide-title">Chromebook spec guide</h2><dl class="spec-list">'+Object.keys(levels).map(k=>'<dt>'+specBadge(k)+'</dt><dd>'+levelTips[k]+'</dd>').join("")+'</dl><p>Estimates depend on your device, the scene, and the game’s graphics settings.</p>'+btn("close-guide","Got it",null,"btn"));
}
function gameLayout(g){
  const displayLabel="Fullscreen";
  const exitLabel="Leave fullscreen";
  const stageImage=g.imported?posterAsset(g.id):relativeAsset(g.id);
  main.innerHTML='<a class="back" href="#/library">'+icon("back")+'All games</a><h1 class="game-title">'+esc(g.title)+'</h1><div class="game-meta">'+specBadge(g.load)+'<span>'+esc(g.genre)+'</span>'+ageBadge(g)+(g.edition?'<span class="edition">'+esc(g.edition)+'</span>':'')+playStatus(g)+'</div>'+
    '<div class="stage-slot"><div id="stage" class="stage centered"><div class="stage-art" style="background-image:url(\''+stageImage+'\')" ></div><div class="startbox" id="startbox"><p role="status">Preparing the player…</p></div><button type="button" class="icon-btn exit-stage" data-action="fullscreen" title="'+exitLabel+'" aria-label="'+exitLabel+'">'+icon("close")+'</button></div></div>'+
    '<div class="play-tools">'+(hub.preferences().showTimer?'<span class="hub-timer" id="hub-session-timer" aria-label="Current session duration">Session 0:00</span>':"")+btn("share-game","Share game","external")+btn("preview-game","Quick preview","info")+btn("health-game","Game status","info")+(g.mode==="embed"?btn("fullscreen",displayLabel,"expand"):"")+bookmark(g.id)+'</div><div id="key-area"></div>'+
    '<div class="details"><section class="pane"><h2>About this game</h2><p>'+esc(g.description || (g.mode==="embed"?"Browser build from the linked source project.":"Listed in the Ultimate Catalog of Web Game Ports."))+'</p><details><summary>Port details &amp; sources</summary><ul>'+g.sources.map((u,i)=>'<li><a target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">'+esc(u.includes("github.com/")?u.replace("https://github.com/",""):new URL(u).hostname)+(g.sources.length>1?" · source "+(i+1):"")+'</a></li>').join("")+'</ul>'+(g.posterSource?'<a class="text-link" href="'+esc(g.posterSource)+'" target="_blank" rel="noopener noreferrer">Preview artwork</a>':'')+'<div id="other-ports"></div></details></section>'+
    '<section class="pane"><h2>Playing on a Chromebook</h2><p>'+esc(g.notes || "Chromebook performance varies by port and device.")+'</p><button class="text-link" data-action="specs">See the spec guide</button><details><summary>Controls & troubleshooting</summary><p>Click or tap inside the game to focus it. Keyboard and controller support depend on the individual port and have not been verified for every game.</p><p>Try Escape to leave native fullscreen. If input stops responding, reload the game. On Chromebooks, use Low graphics to reduce website effects.</p></details></section></div><section class="hub-game-extras"><h2>Similar games</h2>'+grid(hub.similar(g,games))+'<h2>My game notes</h2><p class="hint">Private notes saved only on this browser.</p><textarea id="hub-game-note" rows="4" maxlength="1200" placeholder="Your notes about this game…">'+esc(hub.notes(g.id))+'</textarea><div class="qol-bar">'+btn("save-note","Save note","check")+'</div><p class="hint">Session playtime: '+hub.minutes(g.id)+' minutes tracked (approximate).</p></section>';
  if(g.mode==="embed"){
    $(".play-tools [data-action=fullscreen]").disabled=true;
    player=createPlayer($("#stage"),g.title,scheduleChart,toast);
  }
}
function safeGameUrl(value) {
  const u=new URL(value,location.href);
  if(u.protocol!=="https:" && u.origin!==location.origin)throw Error("Invalid game link.");
  return u.href;
}
async function getLaunch(id){if(!launchCatalog)launchCatalog=readJson("./free-launches.json?v=13").catch(e=>{launchCatalog=null;throw e});const catalog=await launchCatalog;if(!Object.hasOwn(catalog,id))throw Error("No published browser launch link for this game.");return catalog[id];}
async function prepareGame(g, token, autoStart=false){
  if(g.mode!=="embed"){
    $("#startbox").innerHTML='<strong>In-page play unavailable</strong><p>'+esc(g.unavailable)+'</p>'+(g.sources.length?'<a class="secondary-btn" target="_blank" rel="noopener noreferrer" href="'+esc(g.sources[0])+'">View source</a>':"");
    return;
  }
  try{
    const launch=await getLaunch(g.id);
    if(token!==navigation)return;
    const url=safeGameUrl(launch.url);
    const playerUrl=g.id==="simpsons-hit-and-run"?new URL("./imports/hit-and-run/index.html",document.baseURI).href:g.id==="happy-wheels"?new URL("./imports/happy-wheels/",document.baseURI).href:g.id==="2048"?new URL("./imports/2048/",document.baseURI).href:url;
    currentLaunch={id:g.id,url:playerUrl};
    $(".play-tools [data-action=fullscreen]").disabled=false;
    $("#key-area").replaceChildren();
    const externalImport = g.imported && new URL(playerUrl).origin !== location.origin;
    const resolutionOption=chromeOS && (g.load==="high" || externalImport)
      ? '<label class="resolution-option"><input id="limit-resolution" type="checkbox" '+(g.load==="high"?"checked":"")+'> Limit player size to 1280 × 720</label>' : "";
    $("#startbox").innerHTML=btn("start-game",g.edition==="Classic demo"?"Play demo":"Play game","play","btn")+resolutionOption;
    if(autoStart) startGame(g);
    if(launch.alternates?.length) $("#other-ports").innerHTML=launch.alternates.map(a=>'<a class="text-link" href="'+esc(safeGameUrl(a.url))+'" rel="noopener noreferrer" target="_blank">'+esc(a.label)+'</a>').join(" · ");
  }catch(error){
    if(token!==navigation)return;
    $("#startbox").innerHTML='<p>'+esc(error.message)+'</p>'+btn("retry-game","Try again","play","btn");
  }
}
function endPlay(){clearInterval(sessionTicker);sessionTicker=null;if(playSession?.startedAt)hub.recordMinutes(playSession.id,Date.now()-playSession.startedAt);playSession=null;}
function recordPlay(id){
  recentGames=[id,...recentGames.filter(game=>game!==id)].slice(0,4);
  saveValue("recent",JSON.stringify(recentGames));
  
  const gameplay={id,startedAt:Date.now()};
  playSession=gameplay;
  clearInterval(sessionTicker);
  if(hub.preferences().showTimer){sessionTicker=setInterval(()=>{const target=document.querySelector("#hub-session-timer");if(!target||playSession!==gameplay)return;const seconds=Math.floor((Date.now()-gameplay.startedAt)/1000);target.textContent="Session "+Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");},1000);}


}
function startGame(g){
  if(!player || !currentLaunch || currentLaunch.id!==g.id)return;
  if(player.start(currentLaunch.url,$("#limit-resolution")?.checked)){recordPlay(g.id);qol.historyEntry(g);playedIds.add(g.id);hub.recordActivity(g.id);}
}
async function showCredits(token){
  main.innerHTML='<section class="narrow section-page"><a class="back" href="#/library">'+icon("back")+'All games</a><h1 class="panel-title">Credits</h1><p class="subcopy">Game art belongs to the artists and publishers listed below. Each game page links to its port.</p><div id="credits-list" class="pane">Loading credits…</div></section>';
  try {
    const data=await readJson("./credits.json?v=8");if(token!==navigation)return;
    $("#credits-list").innerHTML='<ul class="credits-list">'+data.map(x=>'<li><a href="'+esc(x.source)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+'</a> · '+esc(x.credit)+(x.posterSource?' · <a href="'+esc(x.posterSource)+'" target="_blank" rel="noopener noreferrer">Poster art</a>':'')+'</li>').join("")+'</ul><p class="hint">Interface typefaces include <a class="text-link" href="./assets/fonts/dm-sans-OFL.txt">DM Sans</a> and <a class="text-link" href="./assets/fonts/barlow-condensed-OFL.txt">Barlow Condensed</a>.</p>';
  }catch{if(token===navigation)feedback("#credits-list","Couldn’t load the credits. Refresh to try again.");}
}
function route({scroll=true}={}){
  visibleCount=pageSize;
  endPlay();
  player?.dispose();player=null;
  const previousPage=current.page;
  const token=++navigation;current=readRoute();currentLaunch=null;
  const isSearch=current.page==="search";
  if(isSearch && previousPage!=="search")availability="all";
  if(current.page==="library" && previousPage!=="library")availability="play";
  q=isSearch?(current.params.get("q") || "").slice(0,80):"";search.value=q;
  searchMessage="";
  setNav();$("#theme-panel").hidden=true;$("#theme-button").setAttribute("aria-expanded","false");
  if(guide.open)guide.close();
  const game=current.page==="game" && byId.get(current.id);
  const titles={requests:"Request a game",takedown:"Takedown Request",settings:"Settings",compare:"Compare games",library:"Game vault",top:"Most played locally",saved:"Saved games",credits:"Credits",search:"Search"};
  document.title=(game?.title || titles[current.page] || "Page not found")+" · Unlocked";
  if(current.page==="library" || isSearch)renderLibrary();
  else if(current.page==="saved")renderSaved();
   else if(current.page==="requests")requestsPage();
   else if(current.page==="takedown")takedownPage();
  else if(current.page==="top")drawTop();
   else if(current.page==="history")renderHistory();
   
   else if(current.page==="settings"){main.innerHTML=hub.renderSettings();navigator.storage?.persisted?.().then(ok=>{const el=document.querySelector("#storage-status");if(el)el.textContent=ok?"Persistent site storage is enabled. Clearing site data can still erase saves.":"Local data saves normally, but persistent storage has not been granted.";}).catch(()=>{});}
   else if(current.page==="compare")comparePage();
   
   
  else if(game){gameLayout(game);hub.recordView(game.id);prepareGame(game,token,current.params.get("start")==="1");}
  
  
  
  else if(current.page==="credits")showCredits(token);
  else main.innerHTML='<div class="empty"><h1>Page not found</h1><a class="btn" href="#/library">Browse games</a></div>';
  scheduleChart();
  if(scroll){window.scrollTo(0,0);main.focus({preventScroll:true});}
  if(current.page==="library")offerTour();
   hub.applySettings();
   
   document.documentElement.classList.toggle("low-graphics",performanceMode);
}
function searchView(value){
  const raw=value.slice(0,80), next=raw.trim();searchMessage="";
  if(next===q && current.page==="search")return;
  const hash=next?"#/search?"+new URLSearchParams({q:next}):"#/library";
  if(current.page!=="search") {genre="";level="";}
  if(current.page==="search")history.replaceState(null,"",hash);
  else if(location.hash!==hash)history.pushState(null,"",hash);
  route({scroll:false});search.value=raw;
}
function requestMissing(){if(games.length)searchView(search.value.trim());}
function updateTheme(value){
  if(value==="system")delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme=value;
  const symbol={system:"monitor",dark:"moon",light:"sun"}[value];
  $("#theme").value=value;$("#theme-button").innerHTML=icon(symbol);
  $("#theme-button").title="Appearance: "+value;$("#theme-button").setAttribute("aria-label","Change theme. Current setting: "+value);
}
function setup(){
  document.addEventListener("animationend", e=>{
    if (e.animationName==="feature-fill" && !e.target.closest(".feature-outgoing") && !document.hidden) nextFeature();
  });
  const pauseFeatures = () => document.documentElement.classList.toggle("feature-hidden",document.hidden);
  document.addEventListener("visibilitychange",pauseFeatures);
  pauseFeatures();
  document.querySelectorAll("[data-icon]").forEach(el=>el.innerHTML=icon(el.dataset.icon));
  updateTheme(document.documentElement.dataset.theme || "system");
  $("#theme-button").addEventListener("click",()=>{const panel=$("#theme-panel");panel.hidden=!panel.hidden;$("#theme-button").setAttribute("aria-expanded",String(!panel.hidden));if(!panel.hidden)$("#theme").focus();});
  $("#theme").addEventListener("change",e=>{saveValue("theme",e.target.value);updateTheme(e.target.value);$("#theme-panel").hidden=true;$("#theme-button").setAttribute("aria-expanded","false");$("#theme-button").focus();});
  search.addEventListener("input",()=>{if(games.length)searchView(search.value);});
  $("#search-form").addEventListener("submit",e=>{e.preventDefault();if(games.length)requestMissing();});
  window.addEventListener("hashchange",()=>route());
  
  window.addEventListener("pagehide",e=>{if(!e.persisted)endPlay();});
  
  document.querySelector(".skip").addEventListener("click",e=>{e.preventDefault();main.focus();});
  document.addEventListener("keydown",e=>{
    if(e.key==="g" && e.altKey && !e.repeat){e.preventDefault();location.hash="#/library";}
     if(e.key==="s" && e.altKey && !e.repeat){e.preventDefault();location.hash="#/saved";}
     if(e.key==="r" && e.altKey && !e.repeat && !["INPUT","TEXTAREA","SELECT","IFRAME"].includes(document.activeElement?.tagName)){e.preventDefault();const choices=games.filter(g=>g.mode==="embed");if(choices.length)rouletteView();}
     if(e.key==="/" && !guide.open && !["INPUT","TEXTAREA","SELECT","IFRAME"].includes(document.activeElement?.tagName)){e.preventDefault();search.focus();}
    if(e.key==="Escape"){$("#theme-panel").hidden=true;$("#theme-button").setAttribute("aria-expanded","false");}
  });
  document.addEventListener("click",e=>{
    if(!e.target.closest(".preferences")){$("#theme-panel").hidden=true;$("#theme-button").setAttribute("aria-expanded","false");}
    const bar=e.target.closest("[data-feature]");
    if(bar){nextFeature(Number(bar.dataset.feature));return;}
    const add=e.target.closest("[data-add-folder]");if(add&&selectedFolder!=="All"){qol.storeFolder(selectedFolder,[...(qol.folders()[selectedFolder]||[]),add.dataset.addFolder]);add.remove();toast("Added to folder");return;}
     const remove=e.target.closest("[data-folder-remove]");if(remove&&selectedFolder!=="All"){qol.storeFolder(selectedFolder,(qol.folders()[selectedFolder]||[]).filter(id=>id!==remove.dataset.folderRemove));renderSaved();return;}
     const save=e.target.closest("[data-save]");if(save){rememberGame(save.dataset.save);return;}
    const filter=e.target.closest("[data-genre]");if(filter){genre=filter.dataset.genre;visibleCount=pageSize;renderLibrary();document.querySelector('[data-genre="'+genre+'"]')?.focus({preventScroll:true});return;}
    const link=e.target.closest("a[data-page],a.brand");
    if(link && link.getAttribute("href")==="#/library"){genre="";level="";if(current.page==="library")renderLibrary();}
    const action=e.target.closest("[data-action]")?.dataset.action;
    switch(action){
      case "random-genre":{const genres=[...new Set(games.filter(g=>g.mode==="embed").map(g=>g.genre))];if(genres.length){genre=genres[Math.floor(Math.random()*genres.length)];availability="play";location.hash="#/library";if(current.page==="library")renderLibrary();toast("Random genre: "+genre);}break;}
       case "persist-storage":{const el=document.querySelector("#storage-status");if(!el)break;if(!navigator.storage?.persist){el.textContent="This browser does not offer persistent storage requests. Existing local settings still save normally.";break;}navigator.storage.persist().then(granted=>{if(el.isConnected)el.textContent=granted?"Persistent storage granted for this site. Clearing browser data can still erase saves.":"The browser did not grant persistent storage. Your local settings still save, but site data may be cleared by the browser.";}).catch(()=>{if(el.isConnected)el.textContent="Unable to request persistent storage on this browser.";});break;}
       case "save-note":hub.saveNote(current.id,document.querySelector("#hub-game-note")?.value||"");toast("Note saved locally");break;
       case "export-data":hub.downloadBackup();toast("Backup downloaded");break;
       case "import-data":document.querySelector("#hub-import")?.click();break;
       case "clear-local":if(confirm("Reset local appearance settings? Your favorites and play history will stay.")){qol.write("preferences",{});hub.applySettings();route({scroll:false});}break;
       case "random-game":rouletteView();break;
       case "roulette-again":rouletteView();break;
       case "roulette-play":if(rouletteWinner){const id=rouletteWinner;guide.close();location.hash="#/game/"+id;}break;
       case "performance":performanceMode=!performanceMode;qol.write("performance",performanceMode);document.documentElement.classList.toggle("low-graphics",performanceMode);if(current.page==="library")renderLibrary();break;
       case "share-game":qol.safeCopy(location.href).then(()=>toast("Game link copied")).catch(()=>displayDialog('<h2>Share this game</h2><p>'+esc(location.href)+'</p>'+btn("close-guide","Close",null)));break;
       case "health-game":{const g=byId.get(current.id);if(g)displayDialog('<h2>Game status: '+esc(g.title)+'</h2><p>Live automated game checks are not available. You can flag a problem on this device.</p><div class="actions">'+btn("mark-issue","Mark issue","bug")+btn("clear-issue","Clear flag","check")+btn("close-guide","Close",null)+'</div>');break;}
       case "mark-issue":healthReports[current.id]="issue";qol.write("health",healthReports);guide.close();toast("Flagged on this device");break;
       case "clear-issue":delete healthReports[current.id];qol.write("health",healthReports);guide.close();toast("Local flag cleared");break;
       case "preview-game":{const g=byId.get(current.id);if(g)displayDialog('<h2>'+esc(g.title)+'</h2><p>'+esc(g.description||"Browser game")+'</p><p>Genre: '+esc(g.genre)+' · Performance: '+esc(levels[g.load]||"Unknown")+'</p>'+btn("close-guide","Close",null));break;}
       case "clear-history":qol.write("history",[]);playedIds.clear();renderHistory();break;
       case "new-folder":{const name=prompt("New favorites folder name (up to 30 characters):")?.trim().slice(0,30);if(name&&!["All","__proto__","constructor","prototype"].includes(name)){qol.storeFolder(name,[]);selectedFolder=name;renderSaved();}break;}
       case "add-to-folder":{const available=games.filter(g=>saved.has(g.id)&&!(qol.folders()[selectedFolder]||[]).includes(g.id));if(!available.length){toast("No additional saved games to add");break;}displayDialog('<h2>Add to '+esc(selectedFolder)+'</h2><div class="qol-folder-list">'+available.map(g=>'<button class="secondary-btn" data-add-folder="'+esc(g.id)+'">'+esc(g.title)+'</button>').join("")+'</div>'+btn("close-guide","Done",null));break;}
       case "delete-folder":qol.removeFolder(selectedFolder);selectedFolder="All";renderSaved();break;
       
      
      case "tour":
        rememberTour();
        if(current.page!=="library"){history.pushState(null,"","#/library");route();}
        tourStep=0;guidePage();break;
      case "skip-tour":rememberTour();break;
      case "previous-guide":tourStep=Math.max(0,tourStep-1);guidePage();break;
       case "next-guide":tourStep=Math.min(tourStops.length-1,tourStep+1);guidePage();break;
      case "close-guide":{const completedTour=guide.classList.contains("guided") && tourStep===tourStops.length-1;guide.close();if(completedTour)window.scrollTo({top:0,behavior:performanceMode||window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});break;}
      case "see-top":guide.close();location.hash="#/top";break;
      case "specs":showSpecs();break;
      case "show-more":visibleCount+=pageSize;if(current.page==="top")drawTop();else if(current.page==="saved")renderSaved();else renderLibrary();break;
      case "reset-filters":genre="";level="";availability="all";visibleCount=pageSize;renderLibrary();break;
      
      case "start-game":startGame(byId.get(current.id));break;
      case "retry-game":$("#startbox").innerHTML='<p role="status">Preparing the player…</p>';prepareGame(byId.get(current.id),navigation);break;
      case "fullscreen":player?.toggle();break;
    }
  });
  document.addEventListener("change",e=>{
    if(["availability","more-genres","demand"].includes(e.target.id))visibleCount=pageSize;
    if(e.target.id==="availability"){availability=e.target.value;renderLibrary();$("#availability").focus({preventScroll:true});}
    if(e.target.id==="more-genres"){genre=e.target.value;renderLibrary();$("#more-genres").focus({preventScroll:true});}
    if(e.target.id==="folder-select"){selectedFolder=e.target.value;renderSaved();}
     if(e.target.id==="hub-sort"){sortMode=e.target.value;renderLibrary();}
     if(e.target.id==="compare-one"||e.target.id==="compare-two")updateCompare();
     if(e.target.id==="hub-import"){const file=e.target.files?.[0];if(file&&file.size<160000){file.text().then(text=>{if(!confirm("Import backup and replace matching local settings?"))return;hub.importData(text);location.reload();}).catch(()=>toast("Could not import backup"));}else if(file)toast("Backup file is too large");}
     if(e.target.id==="demand"){level=e.target.value;renderLibrary();$("#demand").focus({preventScroll:true});}
  });
  document.addEventListener("submit",async e=>{
    const form=e.target;
    if(form.id==="request-form"){e.preventDefault();await submitCommunityForm(form,"/v1/requests",{query:form.elements.query.value.trim()});return;}
    if(form.id==="takedown-form"){e.preventDefault();await submitCommunityForm(form,"/v1/takedowns",{game:form.elements.game.value,reason:form.elements.reason.value.trim()});return;}
    if(form.id==="hub-settings"){e.preventDefault();hub.settingsFromForm(form);toast("Settings saved");route({scroll:false});return;}
     if(form.id==="guide-search"){e.preventDefault();const str=form.querySelector("input").value.trim();if(str){guide.close();searchView(str);search.focus();}return;}
    
    
    
    
  });
}
async function readJson(path){
  const res=await fetch(path,{credentials:"omit",cache:"no-cache"});if(!res.ok)throw Error("File unavailable");
  return res.json();
}
setup();
try {games=(await readJson("./games.json?v=13")).sort(alphabetical);byId=new Map(games.map(g=>[g.id,g]));route({scroll:false});}
catch {main.innerHTML='<div class="empty"><h1>Couldn’t open the vault</h1><p>Reload this page to fetch the game catalog.</p><a class="btn" href="./">Reload</a></div>';}
