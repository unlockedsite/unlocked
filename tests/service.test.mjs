import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import service from "../service/index.mjs";

const origin="https://unlockedsite.github.io";
const migrationDir=new URL("../service/drizzle/",import.meta.url);
const files=(await readdir(migrationDir)).filter(name=>name.endsWith(".sql")).sort();
const migrations=await Promise.all(files.map(name=>readFile(new URL(name,migrationDir),"utf8")));
const messageId="123456789012345678";
function fixture(t) {
  const sqlite=new DatabaseSync(":memory:");
  for(const migration of migrations)sqlite.exec(migration);
  t.after(()=>sqlite.close());
  function statement(sql,args=[]) {
    const query=sqlite.prepare(sql);
    return {
      bind:(...params)=>statement(sql,params),
      first:async()=>query.get(...args),
      run:async()=>query.run(...args),
      all:async()=>({results:query.all(...args)})
    };
  }
  const env={ DB:{prepare:statement,batch:statements=>Promise.all(statements.map(s=>s.all()))},
    RATE_SALT:"only-a-test-salt", BUG_HOOK:"https://unit.invalid/report",REQUEST_HOOK:"https://unit.invalid/request" };
  const messages=[];
  t.mock.method(globalThis,"fetch",async (url,options)=>{
    assert.equal(options.redirect,"manual");
    assert.equal(new URL(url).searchParams.get("wait"),"true");
    messages.push({url,payload:JSON.parse(options.body)});
    return Response.json({id:messageId});
  });
  async function call(path,data,headers={}) {
    const args={headers:{Origin:origin,"Content-Type":"application/json",...headers}};
    if(data!==undefined){args.method="POST";args.body=JSON.stringify(data);}
    const res=await service.fetch(new Request("https://unit.invalid"+path,args),env,{waitUntil(){}});
    return {status:res.status,data:await res.json()};
  }
  return {env,call,messages};
}
test("only missing game submissions reach the request webhook, duplicates are acknowledged once",async t=>{
  const {call,messages}=fixture(t);
  for(const query of ["Geometry Dash","amongus","bendy","FNAF 6","DOOM","repo"]){
    assert.equal((await call("/v1/requests",{query})).data.status,"found");
  }
  assert.equal(messages.length,0);
  for(const query of ["Unlisted Adventure","UNLISTED adventure"]){
    assert.equal((await call("/v1/requests",{query})).data.status,"received");
  }
  assert.equal(messages.length,1);
  assert.equal(messages[0].url,"https://unit.invalid/request?wait=true");
  assert.deepEqual(messages[0].payload.allowed_mentions,{parse:[]});
});
test("wrong origins are refused and reports include page, game and a relevant troubleshooting hint",async t=>{
  const {call,messages}=fixture(t);
  const data={game:"geometry-dash",page:"game",kind:"fullscreen",detail:"Fullscreen will not open on click.",device:"ChromeOS · Chrome 134"};
  assert.equal((await call("/v1/reports",data,{Origin:"https://example.org"})).status,403);
  assert.equal(messages.length,0);
  assert.equal((await call("/v1/reports",data)).data.receipt,messageId);
  assert.equal(messages[0].url,"https://unit.invalid/report?wait=true");
  assert.match(JSON.stringify(messages[0].payload),/#\/game\/geometry-dash/);
  assert.match(JSON.stringify(messages[0].payload),/fullscreen delegation/);
  for(let i=0;i<4;i++)assert.equal((await call("/v1/reports",data)).status,200);
  assert.equal((await call("/v1/reports",data)).status,429);
});
test("failed delivery stays retryable and never acknowledges an undelivered request",async t=>{
  const {call}=fixture(t);
  globalThis.fetch.mock.mockImplementationOnce(async()=>new Response(null,{status:429}));
  assert.equal((await call("/v1/requests",{query:"Unlisted Puzzle"})).status,429);
  globalThis.fetch.mock.mockImplementationOnce(async()=>new Response(null,{status:204}));
  assert.equal((await call("/v1/requests",{query:"Unlisted Puzzle"})).status,502);
  assert.equal((await call("/v1/requests",{query:"Unlisted Puzzle"})).data.receipt,messageId);
});
test("only launched game sessions count, renew while playing, expire, and can leave immediately",async t=>{
  const {call}=fixture(t);
  const session=crypto.randomUUID();
  const active=async()=>(await call("/v1/top")).data.active;
  const ping=(state,game="doom")=>call("/v1/presence",{session,state,game});
  t.mock.timers.enable({apis:["Date"],now:Date.now()});
  await ping("active");
  await call("/v1/launch/doom",{});
  assert.deepEqual(await active(),{});
  assert.equal((await call("/v1/play/doom",{session})).status,200);
  assert.deepEqual(await active(),{doom:1});
  t.mock.timers.tick(60000);
  await ping("active");
  t.mock.timers.tick(60000);
  await ping("left","bendy");
  assert.deepEqual(await active(),{doom:1});
  t.mock.timers.tick(31000);
  assert.deepEqual(await active(),{});
  await ping("active");
  assert.deepEqual(await active(),{doom:1});
  await ping("left");
  assert.deepEqual(await active(),{});
  assert.deepEqual((await call("/v1/top")).data.playtimeSeconds,{doom:60});
});
test("opening a details page is separate from a counted launch",async t=>{
  const {call}=fixture(t);
  assert.match((await call("/v1/launch/doom",{})).data.url,/webprboom/);
  assert.deepEqual((await call("/v1/top")).data.playtimeSeconds,{});
  assert.equal((await call("/v1/play/doom",{})).status,200);
  assert.deepEqual((await call("/v1/top")).data.playtimeSeconds,{});
});
test("the optional gate enforces key validity, signed expiry, and revocation on the server",async t=>{
  const {env,call}=fixture(t);
  const key=randomBytes(32).toString("base64url");
  env.ACCESS_MODE="key";env.SESSION_SECRET=randomBytes(32).toString("hex");
  env.ACCESS_KEY_HASHES=createHash("sha256").update(key).digest("hex");
  assert.equal((await call("/v1/launch/doom",{})).status,401);
  assert.equal((await call("/v1/redeem",{key:"invalid"})).status,403);
  const {token}= (await call("/v1/redeem",{key})).data;
  assert.equal((await call("/v1/launch/doom",{},{Authorization:"Bearer "+token})).status,200);
  const changed=token.slice(0,-1)+(token.endsWith("0")?"1":"0");
  assert.equal((await call("/v1/launch/doom",{},{Authorization:"Bearer "+changed})).status,401);
  t.mock.timers.enable({apis:["Date"],now:Date.now()+3700*1000});
  assert.equal((await call("/v1/launch/doom",{},{Authorization:"Bearer "+token})).status,401);
  t.mock.timers.reset();
  env.ACCESS_KEY_HASHES="";
  assert.equal((await call("/v1/launch/doom",{},{Authorization:"Bearer "+token})).status,401);
  env.ACCESS_MODE="bad-config";
  assert.equal((await call("/v1/launch/doom",{})).status,503);
});

test("paused sessions exclude hidden time and retries cannot double-count playtime", async t => {
  const {call} = fixture(t);
  t.mock.timers.enable({apis:["Date"], now:Date.now()});
  const session = crypto.randomUUID();
  const ping = state => call("/v1/presence", {game:"doom", session, state});
  await call("/v1/play/doom", {session});
  t.mock.timers.tick(7000);
  await ping("paused");
  t.mock.timers.tick(48000);
  await ping("active");
  t.mock.timers.tick(9000);
  await ping("left");
  await ping("left");
  assert.deepEqual((await call("/v1/top")).data.playtimeSeconds, {doom:16});
});

test("weekly totals split an active session at Monday UTC without crediting retries or hidden time", async t => {
  const {call,env}=fixture(t);
  const monday=Date.parse("2026-11-23T00:00:00Z");
  t.mock.timers.enable({apis:["Date"],now:monday-20000});
  const session=crypto.randomUUID();
  const ping=state=>call("/v1/presence",{game:"doom",session,state});
  await call("/v1/play/doom",{session});
  t.mock.timers.tick(10000);
  await ping("active");
  assert.deepEqual((await call("/v1/top")).data.weeklyPlaytimeSeconds,{doom:10});
  t.mock.timers.tick(20000);
  await ping("paused");
  await ping("paused");
  let top=(await call("/v1/top")).data;
  assert.equal(top.weekStartsAt,monday/1000);
  assert.deepEqual(top.playtimeSeconds,{doom:30});
  assert.deepEqual(top.weeklyPlaytimeSeconds,{doom:10});
  assert.equal((await env.DB.prepare("SELECT count FROM plays WHERE game=?").bind("week:"+(monday/1000-604800)+":doom").first()).count,20);
  t.mock.timers.tick(50000);
  await ping("active");
  t.mock.timers.tick(10000);
  await ping("left");
  await ping("left");
  top=(await call("/v1/top")).data;
  assert.deepEqual(top.weeklyPlaytimeSeconds,{doom:20});
  assert.deepEqual(top.playtimeSeconds,{doom:40});
});

test("weekly rankings reset while all-time totals and legacy records remain valid",async t=>{
  const {call,env}=fixture(t);
  t.mock.timers.enable({apis:["Date"],now:Date.parse("2026-11-22T12:00:00Z")});
  await env.DB.prepare("INSERT INTO plays VALUES ('seconds:doom',900)").run();
  const session=crypto.randomUUID();
  await call("/v1/play/doom",{session});
  t.mock.timers.tick(10000);
  await call("/v1/presence",{game:"doom",session,state:"left"});
  t.mock.timers.tick(86400000);
  const top=(await call("/v1/top")).data;
  assert.deepEqual(top.playtimeSeconds,{doom:910});
  assert.deepEqual(top.weeklyPlaytimeSeconds,{});
});

test("public release notes include confirmed updates and exclude pending Discord deliveries",async t=>{
  const {call,env}=fixture(t);
  await env.DB.prepare("CREATE TABLE arcade_announcements (version INTEGER PRIMARY KEY,deployment TEXT,sha TEXT,receipt TEXT)").run();
  await env.DB.prepare("INSERT INTO arcade_announcements VALUES (2,'2','4f28bdeabd735c7922fb38b7eec55886f79752d8','receipt'),(3,'3','pending',NULL)").run();
  let response=await call("/v1/updates");
  assert.equal(response.status,200);
  assert.equal(response.data.updates.length,1);
  assert.match(response.data.updates[0].notes,/spotlight tour/);
  await env.DB.prepare("INSERT INTO arcade_release_notes VALUES (3,'• Added weekly playtime rankings.','2026-11-21T00:00:00Z')").run();
  await env.DB.prepare("UPDATE arcade_announcements SET receipt='confirmed' WHERE version=3").run();
  response=await call("/v1/updates");
  assert.equal(response.data.updates[0].version,"1.3");
  assert.equal(response.data.updates[0].notes,"• Added weekly playtime rankings.");
  assert.equal(JSON.stringify(response.data).includes("receipt"),false);
});
