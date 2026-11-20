import { icon } from "./icons.mjs?v=2";
import { matches, normalize } from "./search.mjs";
import { chromeOS, createPlayer } from "./player.mjs?v=6";

const API = "https://unlocked-arcade-service.persistingthoughts0.chatgpt.site";
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
let ticket=dl("session","",true), inviteHidden=dl("tour","")==="seen";
let currentLaunch=null, topCache=null, currentReport="", searchMessage="", sendingSearch="", lastSearchKey="";
let rankedCounts={}, activeCounts={}, chartState="loading", chartRequest=null, chartTimer;
let playSession=null, heartbeatTimer, player=null, launchCatalog;
const receivedQueries = new Set();
const pageSize = 48;
let visibleCount = pageSize;
let availability = "play";
const alphabetical = (a,b) => collate.compare(a.title,b.title);
const bookmarkText = id => saved.has(id) ? "Saved" : "Save game";
const savedClass = id => saved.has(id) ? " active-save" : "";
const feedback = (selector, msg) => {const tag=$(selector);if(tag) tag.textContent=msg;};
const btn = (action, label, glyph, cls="secondary-btn") => '<button type="button" class="'+cls+'" data-action="'+action+'">'+(glyph?icon(glyph):"")+esc(label)+'</button>';

class NetworkError extends Error {
  constructor(status, message) {super(message);this.status=status;}
}
async function api(path, body) {
  const headers = {}, options = {headers, credentials:"omit", referrerPolicy:"no-referrer", signal:AbortSignal.timeout(14000)};
  if(body !== undefined){options.method="POST";headers["Content-Type"]="application/json";options.body=JSON.stringify(body);}
  if(ticket && (/^\/v1\/(?:launch|play)\//).test(path)) headers.Authorization="Bearer "+ticket;
  let res;
  try {res=await fetch(API+path,options);} catch {throw new NetworkError(0,"Couldn’t reach the arcade service. Check your connection and try again.");}
  let data;
  try {data=await res.json();} catch {throw new NetworkError(res.status,"The arcade service couldn’t complete this request.");}
  if(!res.ok) throw new NetworkError(res.status,data.error || "Please try again later.");
  return data;
}
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
function bookmark(id,compact=false,hero=false){
  const active=saved.has(id), name=byId.get(id)?.title || "game";
  return '<button type="button" data-save="'+esc(id)+'" aria-pressed="'+active+'" title="'+(active?"Remove from saved":"Save game")+'" aria-label="'+esc((active?"Remove ":"Save ")+name+(active?" from saved":""))+'" class="'+(compact?"save-mini":hero?"ghost-btn":"secondary-btn")+savedClass(id)+'">'+icon("bookmark")+(compact?"":"<span>"+bookmarkText(id)+"</span>")+'</button>';
}
function activeText(id) {
  if(chartState!=="live")return "—";
  const count=id==="all" ? Object.values(activeCounts).reduce((total,n)=>total+n,0) : (activeCounts[id] || 0);
  return count.toLocaleString();
}
function presence(id) {
  return '<span class="presence" title="Game sessions active on Unlocked in the last 90 seconds">'+icon("users")+'<span data-active="'+id+'">'+activeText(id)+'</span> playing now</span>';
}
function poster(g) {
  return '<img src="'+posterAsset(g.id)+'" alt="" width="320" height="480" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
}
function playStatus(g) {
  return g.mode === "embed" ? presence(g.id) : '<span>In-page play unavailable</span>';
}
function moreButton(total) {
  return total > visibleCount ? '<div class="more-games">'+btn("show-more","Show more games",null)+'</div>' : "";
}
function card(g, {rank=0,count=0}={}) {
  const title=esc(g.title);
  const starts=rank && chartState==="live"?'<span class="poster-plays">'+playtime(count)+'</span>':'';
  return '<article class="card"><a href="#/game/'+g.id+'" aria-label="'+title+'"><div class="cover">'+poster(g)+specBadge(g.load)+(rank?'<span class="rank">#'+rank+'</span>':'')+'</div><div class="card-copy"><span class="poster-genre">'+esc(g.genre)+'</span><h3>'+title+'</h3><div class="poster-numbers">'+playStatus(g)+starts+'</div></div></a>'+bookmark(g.id,true)+'</article>';
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
function invite(){
  return inviteHidden?"":'<aside class="tour-invite">'+icon("gamepad")+'<strong>First time in the vault?</strong><button class="tour-open" data-action="tour">Take the quick tour</button><button class="tour-skip" data-action="skip-tour">Skip</button></aside>';
}
function communityBar(){
  return '<div class="community-bar"><a class="join-discord" href="https://discord.gg/AezupBCtns" target="_blank" rel="noopener noreferrer">'+icon("discord")+'<span><small>Join us on</small><strong>Discord</strong></span>'+icon("forward")+'</a><div class="community-online">'+presence("all")+'</div></div>';
}
function currentRanks(){
  return games.filter(g=>g.mode==="embed").sort((a,b)=>(rankedCounts[b.id]||0)-(rankedCounts[a.id]||0)||alphabetical(a,b));
}
function playtime(seconds){
  if (seconds < 60) return seconds+"s played";
  const minutes = Math.floor(seconds/60);
  return minutes < 60 ? minutes+"m played" : Math.floor(minutes/60)+"h "+minutes%60+"m played";

}
function chartStatus(){
  if(chartState==="live") return '<span class="live-state"><i aria-hidden="true"></i>Live</span>';
  return '<span class="quiet-state">'+(chartState==="loading"?"Updating":"Arcade picks")+'</span>';
}
function chartPanel(){
  const ranks=currentRanks().filter(g=>!featured.includes(g.id)).slice(0,3);
  return '<aside class="chart-panel" id="home-chart" aria-label="Top games"><div class="chart-title"><h2>'+icon("trophy")+'Top games</h2>'+chartStatus()+'</div><ol class="mini-chart">'+ranks.map((g,i)=>{
    const plays=Number(rankedCounts[g.id])||0;
    const countText=chartState==="live"?'<span class="chart-plays">'+playtime(plays)+'</span>':"";
    return '<li><a href="#/game/'+g.id+'"><span class="position">'+String(i+1).padStart(2,"0")+'</span><img src="'+(g.imported?posterAsset(g.id):relativeAsset(g.id))+'" alt="" width="96" height="62" decoding="async"><span class="chart-copy"><strong>'+esc(g.title)+'</strong><small><span class="chart-genre">'+esc(g.genre)+(countText?' · ':'')+'</span>'+countText+'</small></span></a></li>';
  }).join("")+'</ol><a class="chart-all" href="#/top">'+icon("grid")+'Full rankings</a></aside>';
}
function renderLibrary(){
  const searching=current.page==="search";
  const full=searching ? games.filter(g=>!q || matches(g,q)) : games;
  const rows=full.filter(g=>(!genre || g.genre===genre)&&(!level || g.load===level) && (availability==="all" || (g.mode==="embed")===(availability==="play")));
  const label=searching ? "Search results" : "Game library";
  const aside='<div class="shelf-aside">'+(searching?"":invite())+'<span class="sort-label">A–Z</span></div>';
  let html=searching?"":'<div class="spotlight">'+hero()+chartPanel()+'</div>'+communityBar();
  html+=titleBar(searching?"h1":"h2",label,rows.length,aside)+filters();
  if(rows.length) html+=grid(rows.slice(0,visibleCount))+moreButton(rows.length);
  else if(full.length || !q) html+='<div class="empty">'+icon("filter")+'<h2>No games with those filters</h2><p>Clear filters to see every matching title.</p>'+btn("reset-filters","Clear filters","filter")+'</div>';
  else {
    const sent=receivedQueries.has(normalize(q));
    html+='<div class="empty">'+icon("search")+'<h2>'+ (sent?"Request received":"No games found") +'</h2><p>'+(sent?"Aw shucks! We don’t seem to have that game yet, however we saw your search, and will attempt to add it soon!":"There’s no match for “"+esc(q)+"”. Submit this title to send it to the arcade’s game requests on Discord.")+'</p>'+
    (sent?"":'<button class="btn" data-action="request" '+(sendingSearch===normalize(q)?"disabled":"")+'>'+ (sendingSearch===normalize(q)?"Sending…":"Request this game")+'</button>')+'<p class="feedback" role="status" id="request-feedback">'+esc(searchMessage)+'</p></div>';
  }
  main.innerHTML=html;
}
function renderSaved() {
  const rows=games.filter(g=>saved.has(g.id));
  main.innerHTML='<section class="section-page">'+titleBar("h1","Saved games",rows.length)+(rows.length?grid(rows.slice(0,visibleCount))+moreButton(rows.length):'<div class="empty">'+icon("bookmark")+'<h2>Your saved shelf is empty</h2><p>Use the bookmark on a game to keep it here on this device.</p><a class="btn" href="#/library">Browse games</a></div>')+'</section>';
}
function drawTop(){
  const ranks=currentRanks();
  main.innerHTML='<section class="section-page"><div class="shelf-head"><div><h1>Top games</h1><p class="subcopy">Ranked by total time played across the arcade.</p></div><div class="top-live">'+chartStatus()+presence("all")+'</div></div>'+
    (chartState==="offline"?'<p class="hint">Live counts are unavailable. The chart will retry automatically.</p>':"")+
    '<div class="grid">'+ranks.slice(0,visibleCount).map((g,i)=>card(g,{rank:i+1,count:Number(rankedCounts[g.id])||0})).join("")+'</div>'+moreButton(ranks.length)+'</section>';
}
function refreshChart(force=false){
  if(document.hidden || (playSession || player?.expanded()) || !["library","top","search","saved","game"].includes(current.page) || (topCache && !force && Date.now()-topCache.time<20000)) return;
  if(chartRequest)return chartRequest;
  const previousState=chartState,previousCounts=JSON.stringify(rankedCounts);
  chartRequest=api("/v1/top").then(({playtimeSeconds:plays,active})=>{
    if(!plays || !active || typeof plays!=="object" || typeof active!=="object")throw Error("Chart unavailable");
    rankedCounts=plays;activeCounts=active;topCache={time:Date.now()};chartState="live";
  }).catch(()=>{chartState="offline";}).finally(()=>{
    chartRequest=null;
    document.querySelectorAll("[data-active]").forEach(el=>{el.textContent=activeText(el.dataset.active);});
    if(previousState===chartState && previousCounts===JSON.stringify(rankedCounts))return;
    if(current.page==="top")drawTop();
    if(current.page==="library" && $("#home-chart"))$("#home-chart").outerHTML=chartPanel();
  });
  return chartRequest;
}
function scheduleChart(){
  clearInterval(chartTimer);
  if(document.hidden || (playSession || player?.expanded()) || !["library","top","search","saved","game"].includes(current.page))return;
  refreshChart();chartTimer=setInterval(()=>refreshChart(true),30000);
}
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
function guidePage(){
  const steps=[
    ["Find your game","Search by title or nickname. Filter by genre or Chromebook spec to narrow the vault."],
    ["Pick a good fit","Low aims for 60 FPS. Medium aims for 30. High-demand ports may struggle on a Chromebook. These are estimates."],
    ["Keep your favorites","Bookmark a game to save it here. Top games ranks games by total playtime, and the player has a fullscreen control."],
    ["What’s your favorite game?","Search the vault for a favorite, or browse our arcade picks. Missing games can be requested from the results."]
  ];
  const [title,body]=steps[tourStep];
  displayDialog('<div class="guide-steps" aria-label="Step '+(tourStep+1)+' of 4">'+steps.map((_,i)=>'<i class="'+(i<=tourStep?"on":"")+'"></i>').join("")+'</div><h2 id="guide-title">'+title+'</h2><p>'+body+'</p>'+
    (tourStep===3?'<form class="guide-search" id="guide-search"><input aria-label="Favorite game title" placeholder="Favorite game" maxlength="80"><button class="btn">Search</button></form>':"")+
    '<div class="actions"><button class="tour-skip" data-action="close-guide">'+(tourStep===3?"Done":"Skip tour")+'</button>'+btn(tourStep===3?"see-top":"next-guide",tourStep===3?"View top games":"Next",null,"btn")+'</div>');
}
function showSpecs(){
  displayDialog('<h2 id="guide-title">Chromebook spec guide</h2><dl class="spec-list">'+Object.keys(levels).map(k=>'<dt>'+specBadge(k)+'</dt><dd>'+levelTips[k]+'</dd>').join("")+'</dl><p>Estimates depend on your device, the scene, and the game’s graphics settings.</p>'+btn("close-guide","Got it",null,"btn"));
}
function reportUrl(){
  const p=new URLSearchParams({from:current.page});
  if(current.page==="game")p.set("game",current.id);
  return "#/report?"+p;
}
function gameLayout(g){
  const displayLabel="Fullscreen";
  const exitLabel="Leave fullscreen";
  const stageImage=g.imported?posterAsset(g.id):relativeAsset(g.id);
  main.innerHTML='<a class="back" href="#/library">'+icon("back")+'All games</a><h1 class="game-title">'+esc(g.title)+'</h1><div class="game-meta">'+specBadge(g.load)+'<span>'+esc(g.genre)+'</span>'+(g.edition?'<span class="edition">'+esc(g.edition)+'</span>':'')+playStatus(g)+'</div>'+
    '<div class="stage-slot"><div id="stage" class="stage centered"><div class="stage-art" style="background-image:url(\''+stageImage+'\')" ></div><div class="startbox" id="startbox"><p role="status">Preparing the player…</p></div><button type="button" class="icon-btn exit-stage" data-action="fullscreen" title="'+exitLabel+'" aria-label="'+exitLabel+'">'+icon("close")+'</button></div></div>'+
    '<div class="play-tools">'+(g.mode==="embed"?btn("fullscreen",displayLabel,"expand"):"")+bookmark(g.id)+'<a class="secondary-btn report-link" href="'+reportUrl()+'">'+icon("bug")+'Report a bug</a></div><div id="key-area"></div>'+
    '<div class="details"><section class="pane"><h2>About this game</h2><p>'+esc(g.description || (g.mode==="embed"?"Browser build from the linked source project.":"Listed in the Ultimate Catalog of Web Game Ports."))+'</p><details><summary>Port details &amp; sources</summary><ul>'+g.sources.map((u,i)=>'<li><a target="_blank" rel="noopener noreferrer" href="'+esc(u)+'">'+esc(u.includes("github.com/")?u.replace("https://github.com/",""):new URL(u).hostname)+(g.sources.length>1?" · source "+(i+1):"")+'</a></li>').join("")+'</ul>'+(g.posterSource?'<a class="text-link" href="'+esc(g.posterSource)+'" target="_blank" rel="noopener noreferrer">Preview artwork</a>':'')+'<div id="other-ports"></div></details></section>'+
    '<section class="pane"><h2>Playing on a Chromebook</h2><p>'+esc(g.notes || "Chromebook performance varies by port and device.")+'</p><button class="text-link" data-action="specs">See the spec guide</button></section></div>';
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
async function getLaunch(id) {
  // Free releases ship their launch map alongside the catalog on Pages.
  // Gated releases omit the map and authorize each launch with the Worker.
  if (!launchCatalog) {
    launchCatalog = fetch("./free-launches.json?v=8", {credentials:"omit",cache:"no-store"}).then(async response => {
      if (response.status===404) return null;
      if (!response.ok) throw Error("Couldn’t load the launch catalog. Try again.");
      return response.json();
    }).catch(error => {launchCatalog=null;throw error;});
  }
  const catalog = await launchCatalog;
  if (catalog && Object.hasOwn(catalog,id)) return catalog[id];
  return api("/v1/launch/"+id,{});
}
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
    if(error.status===401){
      ticket="";saveValue("session","",true);
      $("#startbox").innerHTML='<p>Enter your arcade key below to launch.</p>';
      $("#key-area").innerHTML='<form class="keybox" id="redeem"><label for="access-key">Arcade access key</label><input id="access-key" type="password" autocomplete="off" maxlength="128" required><div class="actions"><button class="btn">Unlock player</button></div><p class="feedback" role="status" id="key-result"></p></form>';
    }else{
      $("#startbox").innerHTML='<p>'+esc(error.message)+'</p>'+btn("retry-game","Try again","play","btn");
    }
  }
}
function signalPresence(gameplay,state){
  return fetch(API+"/v1/presence",{
    method:"POST",mode:"cors",credentials:"omit",keepalive:state!=="active",referrerPolicy:"no-referrer",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({game:gameplay.id,session:gameplay.session,state})
  }).catch(()=>{});
}
function scheduleHeartbeat(){
  clearInterval(heartbeatTimer);
  if(!playSession?.registered)return;
  if(document.hidden){signalPresence(playSession,"paused");return;}
  const gameplay=playSession;
  signalPresence(gameplay,"active");
  heartbeatTimer=setInterval(()=>signalPresence(gameplay,"active"),30000);
}
function endPlay(){
  clearInterval(heartbeatTimer);
  if(playSession?.registered)signalPresence(playSession,"left");
  playSession=null;
}
function recordPlay(id){
  topCache=null;
  const gameplay={id,session:crypto.randomUUID(),registered:false};
  playSession=gameplay;
  clearInterval(chartTimer);
  api("/v1/play/"+id,{session:gameplay.session}).then(()=>{
    gameplay.registered=true;
    if(playSession!==gameplay){signalPresence(gameplay,"left");return;}
    scheduleHeartbeat();
  }).catch(()=>{ /* Play continues if the count service is offline. */ });
}
function startGame(g){
  if(!player || !currentLaunch || currentLaunch.id!==g.id)return;
  if(player.start(currentLaunch.url,$("#limit-resolution")?.checked)) recordPlay(g.id);
}
function renderReport(){
  const selected=byId.get(current.params.get("game")), page=current.params.get("from") || "report";
  const from=["game","library","saved","top"].includes(page)?page:"report";
  const option=(value,label,choose=false)=>'<option '+(choose?"selected ":"")+'value="'+esc(value)+'">'+esc(label)+'</option>';
  main.innerHTML='<section class="narrow section-page"><a class="back" href="'+(selected?"#/game/"+selected.id:"#/library")+'">'+icon("back")+(selected?esc(selected.title):"All games")+'</a><h1 class="panel-title">Report a bug</h1><p class="subcopy">Tell the arcade team what happened and how to reproduce it.</p><form class="form" id="report-form" data-from="'+from+'"><div class="row"><div class="field"><label for="report-game">Game or page</label><span class="selectbox"><select id="report-game">'+option("","Arcade website")+games.map(g=>option(g.id,g.title,g===selected)).join("")+'</select>'+icon("chevron")+'</span></div><div class="field"><label for="kind">Issue type</label><span class="selectbox"><select id="kind">'+Object.entries(categories).map(([k,v])=>option(k,v)).join("")+'</select>'+icon("chevron")+'</span></div></div><div class="field"><label for="detail">What happened?</label><textarea id="detail" placeholder="What did you click, what did you expect, and what happened instead?" minlength="10" maxlength="1000" required></textarea></div><div class="field"><label class="check"><input id="share-device" type="checkbox" checked> Include my browser and operating system</label><p class="hint">This sends your report, game, and arcade page to the team’s Discord.</p></div><button class="btn" type="submit">'+icon("bug")+'Send report</button><p id="report-result" class="feedback" role="status" aria-live="polite">'+esc(currentReport)+'</p></form></section>';
}
function deviceLabel(){
  const ua=navigator.userAgent, os=/CrOS/.test(ua)?"ChromeOS":/Android/.test(ua)?"Android":/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?"iOS":/Windows/.test(ua)?"Windows":/Mac/.test(ua)?"macOS":/Linux/.test(ua)?"Linux":"Other";
  const engine=[["Edge",/Edg(?:A|iOS)?\/(\d+)/],["Firefox",/(?:Firefox|FxiOS)\/(\d+)/],["Chrome",/(?:Chrome|CriOS)\/(\d+)/],["Safari",/Version\/(\d+).*Safari/]].map(([name,re])=>[name,ua.match(re)?.[1]]).find(([,version])=>version);
  return os+" · "+(engine?engine.join(" "):"Other");
}
async function submitReport(form){
  if(!form.reportValidity()) return;
  const token=navigation, button=form.querySelector("button[type=submit]");
  if(button.disabled)return;
  const body={game:$("#report-game").value,page:form.dataset.from,kind:$("#kind").value,detail:$("#detail").value,device:$("#share-device").checked?deviceLabel():""};
  button.disabled=true;feedback("#report-result","Sending your report…");
  try{
    const result=await api("/v1/reports",body);if(navigation!==token)return;
    form.innerHTML='<h2>Report received</h2><p>Delivered to the arcade team on Discord.</p><p>'+esc(result.hint)+'</p><p class="hint">Receipt '+esc(result.receipt)+'</p><a class="btn" href="'+(body.game?"#/game/"+body.game:"#/library")+'">Back to '+(body.game?"game":"all games")+'</a>';
  }catch(e){if(navigation===token){feedback("#report-result",e.message);button.disabled=false;}}
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
  const token=++navigation;current=readRoute();currentLaunch=null;currentReport="";
  const isSearch=current.page==="search";
  if(isSearch && previousPage!=="search")availability="all";
  if(current.page==="library" && previousPage!=="library")availability="play";
  q=isSearch?(current.params.get("q") || "").slice(0,80):"";search.value=q;
  searchMessage="";
  setNav();$("#theme-panel").hidden=true;$("#theme-button").setAttribute("aria-expanded","false");
  if(guide.open)guide.close();
  const game=current.page==="game" && byId.get(current.id);
  const titles={library:"Game vault",top:"Top games",saved:"Saved games",report:"Report a bug",credits:"Credits",search:"Search"};
  document.title=(game?.title || titles[current.page] || "Page not found")+" · Unlocked";
  if(current.page==="library" || isSearch)renderLibrary();
  else if(current.page==="saved")renderSaved();
  else if(current.page==="top")drawTop();
  else if(game){gameLayout(game);prepareGame(game,token,current.params.get("start")==="1");}
  else if(current.page==="report")renderReport();
  else if(current.page==="credits")showCredits(token);
  else main.innerHTML='<div class="empty"><h1>Page not found</h1><a class="btn" href="#/library">Browse games</a></div>';
  scheduleChart();
  if(scroll){window.scrollTo(0,0);main.focus({preventScroll:true});}
}
function searchView(value){
  const raw=value.slice(0,80), next=raw.trim();searchMessage="";
  if(next===q && current.page==="search")return;
  const hash=next?"#/search?"+new URLSearchParams({q:next}):"#/library";
  if(current.page!=="search") {genre="";level="";lastSearchKey="";}
  if(current.page==="search")history.replaceState(null,"",hash);
  else if(location.hash!==hash)history.pushState(null,"",hash);
  route({scroll:false});search.value=raw;
}
async function requestMissing(){
  const term=search.value.trim(),key=normalize(term);
  if(!term)return;
  if(current.page!=="search" || q!==term)searchView(term);
  if(games.some(g=>matches(g,term))) {genre="";level="";availability="all";visibleCount=pageSize;renderLibrary();return;}
  if(!key){searchMessage="Enter a game title with at least two letters or numbers.";renderLibrary();return;}
  if(receivedQueries.has(key) || sendingSearch===key)return;
  lastSearchKey=key;sendingSearch=key;searchMessage="";renderLibrary();
  try{
    const result=await api("/v1/requests",{query:term});
    if(result.status==="received")receivedQueries.add(key);
    else if(lastSearchKey===key)searchMessage="That title is already in the vault. Refresh to see the latest catalog.";
  }catch(e){if(lastSearchKey===key)searchMessage=e.message;}
  finally{if(sendingSearch===key)sendingSearch="";if(current.page==="search" && normalize(q)===key)renderLibrary();}
}
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
  document.addEventListener("visibilitychange",()=>{scheduleHeartbeat();scheduleChart();});
  window.addEventListener("pagehide",e=>{if(!e.persisted)endPlay();else if(playSession?.registered)signalPresence(playSession,"paused");clearInterval(heartbeatTimer);});
  window.addEventListener("pageshow",e=>{if(e.persisted){scheduleHeartbeat();scheduleChart();}});
  document.querySelector(".skip").addEventListener("click",e=>{e.preventDefault();main.focus();});
  document.addEventListener("keydown",e=>{
    if(e.key==="/" && !guide.open && !["INPUT","TEXTAREA","SELECT","IFRAME"].includes(document.activeElement?.tagName)){e.preventDefault();search.focus();}
    if(e.key==="Escape"){$("#theme-panel").hidden=true;$("#theme-button").setAttribute("aria-expanded","false");}
  });
  document.addEventListener("click",e=>{
    if(!e.target.closest(".preferences")){$("#theme-panel").hidden=true;$("#theme-button").setAttribute("aria-expanded","false");}
    const bar=e.target.closest("[data-feature]");
    if(bar){nextFeature(Number(bar.dataset.feature));return;}
    const save=e.target.closest("[data-save]");if(save){rememberGame(save.dataset.save);return;}
    const filter=e.target.closest("[data-genre]");if(filter){genre=filter.dataset.genre;visibleCount=pageSize;renderLibrary();document.querySelector('[data-genre="'+genre+'"]')?.focus({preventScroll:true});return;}
    const link=e.target.closest("a[data-page],a.brand");
    if(link && link.getAttribute("href")==="#/library"){genre="";level="";if(current.page==="library")renderLibrary();}
    const footerBug=e.target.closest('.footer a[href="#/report"]');if(footerBug && current.page!=="report"){e.preventDefault();location.hash=reportUrl();}
    const action=e.target.closest("[data-action]")?.dataset.action;
    switch(action){
      case "tour":tourStep=0;rememberTour();guidePage();break;
      case "skip-tour":rememberTour();break;
      case "next-guide":tourStep=Math.min(3,tourStep+1);guidePage();break;
      case "close-guide":guide.close();break;
      case "see-top":guide.close();location.hash="#/top";break;
      case "specs":showSpecs();break;
      case "show-more":visibleCount+=pageSize;if(current.page==="top")drawTop();else if(current.page==="saved")renderSaved();else renderLibrary();break;
      case "reset-filters":genre="";level="";availability="all";visibleCount=pageSize;renderLibrary();break;
      case "request":requestMissing();break;
      case "start-game":startGame(byId.get(current.id));break;
      case "retry-game":$("#startbox").innerHTML='<p role="status">Preparing the player…</p>';prepareGame(byId.get(current.id),navigation);break;
      case "fullscreen":player?.toggle();break;
    }
  });
  document.addEventListener("change",e=>{
    if(["availability","more-genres","demand"].includes(e.target.id))visibleCount=pageSize;
    if(e.target.id==="availability"){availability=e.target.value;renderLibrary();$("#availability").focus({preventScroll:true});}
    if(e.target.id==="more-genres"){genre=e.target.value;renderLibrary();$("#more-genres").focus({preventScroll:true});}
    if(e.target.id==="demand"){level=e.target.value;renderLibrary();$("#demand").focus({preventScroll:true});}
  });
  document.addEventListener("submit",async e=>{
    const form=e.target;
    if(form.id==="guide-search"){e.preventDefault();const str=form.querySelector("input").value.trim();if(str){guide.close();searchView(str);search.focus();}return;}
    if(form.id==="report-form"){e.preventDefault();submitReport(form);return;}
    if(form.id==="redeem"){e.preventDefault();const token=navigation;try{const result=await api("/v1/redeem",{key:$("#access-key").value});if(token!==navigation)return;ticket=result.token || "";saveValue("session",ticket,true);await prepareGame(byId.get(current.id),token);}catch(error){if(token===navigation)feedback("#key-result",error.message);}}
  });
}
async function readJson(path){
  const res=await fetch(path,{credentials:"omit"});if(!res.ok)throw Error("File unavailable");
  return res.json();
}
setup();
try {games=(await readJson("./games.json?v=8")).sort(alphabetical);byId=new Map(games.map(g=>[g.id,g]));route({scroll:false});}
catch {main.innerHTML='<div class="empty"><h1>Couldn’t open the vault</h1><p>Reload this page to fetch the game catalog.</p><a class="btn" href="./">Reload</a></div>';}
