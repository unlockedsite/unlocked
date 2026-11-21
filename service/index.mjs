import { announce, publishedUpdates } from "./updates.mjs";
import games from "../docs/games.json" with { type: "json" };
import ports from "./ports.json" with { type: "json" };
import { matches, normalize } from "../docs/search.mjs";

const ORIGIN = "https://unlockedsite.github.io";
const encoder = new TextEncoder();
const bodyLimit = 4800;
const byId = new Map(games.map(game => [game.id, game]));
const hints = {
  loading: "Check the port URL and the first missing network request. For a threaded build, compare the standalone launch and verify its isolation headers.",
  performance: "Compare the game's spec estimate with the device. Try the lowest graphics preset, close spare tabs, and test the same scene again.",
  controls: "Check keyboard focus and the port's documented input method. Compare the embedded and standalone player.",
  fullscreen: "Start fullscreen with the player button. If the browser blocks it, open the arcade directly and check iframe fullscreen delegation.",
  sound: "Test sound after a direct click inside the game. Check per-tab mute and the game's audio settings.",
  other: "Reproduce with the supplied steps on the same page, then compare a second browser to narrow down the cause."
};

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const reject = (status, message) => { throw new ApiError(status, message); };
const seconds = () => Math.floor(Date.now() / 1000);
const safeText = (value, max) => typeof value === "string"
  ? value.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, "").trim().slice(0, max)
  : "";
const hex = buffer => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");
const digest = async text => hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));

async function jsonBody(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
    reject(415, "Send JSON.");
  if (Number(request.headers.get("Content-Length") || 0) > bodyLimit) reject(413, "Message too long.");
  const reader = request.body?.getReader();
  if (!reader) reject(400, "Missing form.");
  const decoder = new TextDecoder();
  let size = 0, text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > bodyLimit) { await reader.cancel(); reject(413, "Message too long."); }
    text += decoder.decode(value, { stream: true });
  }
  let data;
  try { data = JSON.parse(text + decoder.decode()); } catch { reject(400, "Invalid form."); }
  if (!data || Array.isArray(data) || typeof data !== "object") reject(400, "Invalid form.");
  return data;
}

// Store rotating hashes and totals. Discord never receives an IP, referrer or user identifier.
async function limit(request, env, action, perHour, perSite) {
  if (!env.DB || !env.RATE_SALT) reject(503, "Service unavailable. Try again later.");
  const hour = Math.floor(seconds() / 3600);
  const ip = request.headers.get("CF-Connecting-IP") || "shared";
  const id = await digest([env.RATE_SALT, hour, ip].join("|"));
  const expires = (hour + 1) * 3600;
  const bump = env.DB.prepare("INSERT INTO counters (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count");
  const client = await bump.bind(action + ":" + id, expires, perHour).first();
  if (!client) reject(429, "Too many submissions. Please try again later.");
  const site = await bump.bind(action + ":all:" + hour, expires, perSite).first();
  if (!site) reject(429, "The arcade is busy. Try again later.");
}

async function deliver(url, title, fields, color, pingEveryone = false) {
  if (!url) reject(503, "Delivery is unavailable. Please try again later.");
  const destination = new URL(url);
  if (destination.hostname === "canary.discord.com") destination.hostname = "discord.com";
  destination.searchParams.set("wait", "true");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    // workerd supports manual/follow. Manual also keeps the secret on its original endpoint.
    const result = await fetch(destination.href, {
      method: "POST", redirect: "manual", signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: pingEveryone ? "@everyone" : undefined, allowed_mentions: { parse: pingEveryone ? ["everyone"] : [] }, embeds: [{
        title, fields, color, timestamp: new Date().toISOString(), footer: { text: "Unlocked Arcade" }
      }] })
    });
    if (!result.ok) reject(result.status === 429 ? 429 : 502, "Discord did not accept this yet. Please try again later.");
    const receipt = await result.json();
    if (!/^\d{15,21}$/.test(receipt?.id || "")) reject(502, "Discord did not confirm delivery. Please try again.");
    return receipt.id;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    reject(502, "Discord could not confirm delivery. Please try again.");
  } finally { clearTimeout(timer); }
}
const field = (name, value, inline = false) => ({ name, value: value || "Unspecified", inline });

async function missing(request, env, data) {
  const title = safeText(data.query, 81);
  if (title.length < 2 || title.length > 80 || !normalize(title) || /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[\r\n]/i.test(title))
    reject(400, "Enter just the game title, between 2 and 80 characters.");
  if (games.some(game => matches(game, title))) return { status: "found" };
  await limit(request, env, "search", 12, 240);
  const key = await digest("search:" + normalize(title));
  const now = seconds();
  const ticket = await env.DB.prepare("INSERT INTO request_receipts (key,state,expires) VALUES (?,'pending',?) ON CONFLICT(key) DO UPDATE SET state='pending',expires=excluded.expires WHERE request_receipts.expires <= ? RETURNING key")
    .bind(key, now + 60, now).first();
  if (!ticket) {
    const prior = await env.DB.prepare("SELECT state FROM request_receipts WHERE key=?").bind(key).first();
    if (prior?.state === "sent") return { status: "received" };
    reject(409, "This request is being delivered. Try again in a moment.");
  }
  let receipt;
  try {
    receipt = await deliver(env.REQUEST_HOOK, "Missing game request", [
      field("Requested title", title), field("From", ORIGIN + "/unlocked/ · Arcade search")
    ], 0x85aaff);
  } catch (error) {
    await env.DB.prepare("DELETE FROM request_receipts WHERE key=? AND state='pending'").bind(key).run();
    throw error;
  }
  await env.DB.prepare("UPDATE request_receipts SET state='sent',expires=? WHERE key=?").bind(now + 86400, key).run();
  return { status: "received", receipt };
}

async function bug(request, env, data) {
  const detail = safeText(data.detail, 1001);
  if (detail.length < 10 || detail.length > 1000 || !Object.hasOwn(hints, data.kind)) reject(400, "Choose a category and describe what happened in 10–1,000 characters.");
  const game = byId.get(data.game);
  const pages = { library: "All games", top: "Top games", saved: "Saved games", report: "Report form", game: "Game player" };
  const route = Object.hasOwn(pages, data.page) ? data.page : "report";
  const device = safeText(data.device, 55);
  const platform = /^(ChromeOS|Windows|macOS|Android|iOS|Linux|Other) · (Chrome|Edge|Firefox|Safari|Other)( \d{1,3})?$/.test(device) ? device : "Not shared";
  const source = ORIGIN + "/unlocked/#/" + (route === "game" && game ? "game/" + game.id : route);
  await limit(request, env, "bug", 5, 100);
  const receipt = await deliver(env.BUG_HOOK, "Arcade bug report", [
    field("Page", pages[route] + " · " + source), field("Game", game?.title || "Arcade website", true),
    field("Issue", data.kind, true), field("Device", platform, true),
    field("What happened", detail), field("Suggested first check", hints[data.kind])
  ], 0xffb95b);
  return { status: "received", receipt, hint: hints[data.kind] };
}

async function takedown(request, env, data) {
  const game=byId.get(data.game);
  const reason=safeText(data.reason,1501);
  if(!game)reject(400,"Choose a valid game.");
  if(reason.length<15 || reason.length>1500)reject(400,"Explain your reason in 15–1,500 characters.");
  await limit(request,env,"takedown",2,30);
  // Takedown submissions intentionally use the same configured delivery secret as game requests.
  const receipt=await deliver(env.REQUEST_HOOK,"TAKEDOWN REQUEST",[
    field("Game",game.title),
    field("Game link",ORIGIN+"/unlocked/#/game/"+encodeURIComponent(game.id)),
    field("Reason",reason)
  ],0xe53935,true);
  return {status:"received",receipt};
}
const presenceWindow = 90;
const weekSeconds = 7 * 86400;
// Unix epoch began on a Thursday. Weeks start Monday at 00:00 UTC.
const weekStart = now => Math.floor((now - 4 * 86400) / weekSeconds) * weekSeconds + 4 * 86400;
async function sessionKey(value, env) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) reject(400, "Invalid game session.");
  if (!env.RATE_SALT) reject(503, "Player counts are temporarily unavailable.");
  return digest(env.RATE_SALT + ":presence:" + value);
}
async function updatePresence(env, data) {
  const key = await sessionKey(data.session, env);
  if (!byId.has(data.game)) reject(400, "Unknown game.");
  if (!["left", "active", "paused"].includes(data.state)) reject(400, "Unknown session state.");
  const now = seconds();
  // The prefix keeps elapsed seconds separate from historical launch counts.
  // D1 batches are atomic: simultaneous heartbeats cannot credit an interval twice.
  const credit = env.DB.prepare(`INSERT INTO plays(game,count)
    SELECT ?, ? - seen FROM presence WHERE session=? AND game=? AND seen BETWEEN ? AND ?
    ON CONFLICT(game) DO UPDATE SET count=count+excluded.count`)
    .bind("seconds:"+data.game, now, key, data.game, now-presenceWindow, now-1);
  const week = weekStart(now);
  const weeklyCredit = env.DB.prepare(`INSERT INTO plays(game,count)
    SELECT ?, ? - MAX(seen,?) FROM presence
    WHERE session=? AND game=? AND seen BETWEEN ? AND ? AND ?>MAX(seen,?)
    ON CONFLICT(game) DO UPDATE SET count=count+excluded.count`)
    .bind("week:"+week+":"+data.game, now, week, key, data.game, now-presenceWindow, now-1, now, week);
  const previousWeekCredit = env.DB.prepare(`INSERT INTO plays(game,count)
    SELECT ?, ? - seen FROM presence
    WHERE session=? AND game=? AND seen BETWEEN ? AND ? AND seen<?
    ON CONFLICT(game) DO UPDATE SET count=count+excluded.count`)
    .bind("week:"+(week-weekSeconds)+":"+data.game, week, key, data.game, now-presenceWindow, now-1, week);
  const update = data.state === "left"
    ? env.DB.prepare("DELETE FROM presence WHERE session=? AND game=?").bind(key, data.game)
    : env.DB.prepare("UPDATE presence SET seen=? WHERE session=? AND game=? AND abs(seen)<=?")
      .bind(data.state === "paused" ? -now : now, key, data.game, now);
  await env.DB.batch([credit, weeklyCredit, previousWeekCredit, update]);
  return { ok: true };
}

function accessMode(env) {
  const mode = env.ACCESS_MODE ?? "free";
  if (mode !== "free" && mode !== "key") reject(503, "Launch settings are unavailable.");
  return mode;
}
function allowedHashes(env) {
  return (env.ACCESS_KEY_HASHES || "").split(",").map(s => s.trim()).filter(s => /^[a-f0-9]{64}$/.test(s));
}
async function signer(env) {
  if ((env.SESSION_SECRET || "").length < 32) reject(503, "Key access is not configured.");
  return crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function redeem(request, env, data) {
  if (accessMode(env) === "free") return { mode: "free" };
  await limit(request, env, "redeem", 8, 300);
  const id = await digest(safeText(data.key, 128));
  if (!allowedHashes(env).includes(id)) reject(403, "That key is not active.");
  const expiry = seconds() + 3600;
  const tokenBody = id + "." + expiry;
  const signature = hex(await crypto.subtle.sign("HMAC", await signer(env), encoder.encode(tokenBody)));
  return { token: tokenBody + "." + signature, expires: expiry };
}
async function authorizeLaunch(request, env) {
  if (accessMode(env) === "free") return;
  const token = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})\.(\d{10})\.([a-f0-9]{64})$/);
  if (!token || +token[2] <= seconds() || !allowedHashes(env).includes(token[1])) reject(401, "An active arcade key is required.");
  const signature = Uint8Array.from(token[3].match(/../g), pair => parseInt(pair, 16));
  const valid = await crypto.subtle.verify("HMAC", await signer(env), signature, encoder.encode(token[1] + "." + token[2]));
  if (!valid) reject(401, "Your session expired. Enter your key again.");
}

async function routes(request, env, ctx) {
  const path = new URL(request.url).pathname;
  if (path === "/v1/health" && request.method === "GET") {
    const schema = await env.DB?.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('counters','request_receipts','plays','presence')").first();
    return { ready: Boolean(schema?.n === 4 && env.BUG_HOOK && env.REQUEST_HOOK && env.RATE_SALT), mode: accessMode(env) };
  }
  if (path === "/v1/top" && request.method === "GET") {
    const week = weekStart(seconds());
    const prefix = "week:"+week+":";
    const [totals, online, weekly] = await env.DB.batch([
      env.DB.prepare("SELECT substr(game,9) AS game,count FROM plays WHERE game LIKE 'seconds:%'"),
      env.DB.prepare("SELECT game,COUNT(*) AS count FROM presence WHERE seen>? GROUP BY game").bind(seconds()-presenceWindow),
      env.DB.prepare("SELECT substr(game,?) AS game,count FROM plays WHERE game LIKE ?").bind(prefix.length+1,prefix+"%")
    ]);
    const counts = rows => Object.fromEntries(rows.filter(row => byId.has(row.game)).map(row => [row.game, row.count]));
    return { playtimeSeconds: counts(totals.results), weeklyPlaytimeSeconds: counts(weekly.results), weekStartsAt: week, active: counts(online.results), windowSeconds: presenceWindow };
  }
  if (path === "/v1/updates" && request.method === "GET") return publishedUpdates(env);
  if (request.method !== "POST") reject(404, "Page not found.");
  const data = await jsonBody(request);
  if (path === "/v1/redeem") return redeem(request, env, data);
  if (path === "/v1/presence") return updatePresence(env, data);
  if (path === "/v1/reports" || path === "/v1/requests" || path === "/v1/takedowns") {
    const result = path === "/v1/reports" ? await bug(request, env, data) : path === "/v1/takedowns" ? await takedown(request, env, data) : await missing(request, env, data);
    ctx?.waitUntil(env.DB.batch([
      env.DB.prepare("DELETE FROM counters WHERE expires < ?").bind(seconds()),
      env.DB.prepare("DELETE FROM request_receipts WHERE expires < ?").bind(seconds())
    ]).catch(() => {}));
    return result;
  }
  const launch = path.match(/^\/v1\/(launch|play)\/([a-z0-9-]+)$/);
  if (launch) {
    await authorizeLaunch(request, env);
    const game = byId.get(launch[2]), port = Object.hasOwn(ports, launch[2]) && ports[launch[2]];
    if (!game || !port?.url) reject(404, "This game has no browser launch available.");
    if (game.mode === "unavailable") reject(409, game.unavailable);
    if (launch[1] === "play") {
      await limit(request, env, "play", 90, 30000);
      const updates = [];
      if (data.session) {
        const key = await sessionKey(data.session, env);
        updates.push(env.DB.prepare("INSERT INTO presence(session,game,seen) VALUES (?,?,?) ON CONFLICT(session) DO NOTHING").bind(key, game.id, seconds()));
        updates.push(env.DB.prepare("DELETE FROM presence WHERE abs(seen) < ?").bind(seconds() - 86400));
      }
      if (updates.length) await env.DB.batch(updates);
      return { recorded: true };
    }
    return { url: port.url, alternates: port.alternates || [] };
  }
  reject(404, "Page not found.");
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const headers = {
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin",
      "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "600"
    };
    if (origin === ORIGIN) headers["Access-Control-Allow-Origin"] = ORIGIN;
    try {
      const release = new URL(request.url).pathname.match(/^\/v1\/update-announcements\/(\d+)$/);
      if (release && request.method === "POST" && !origin) return await announce(release[1], env);
      if ((origin && origin !== ORIGIN) || (request.method === "POST" && origin !== ORIGIN)) reject(403, "Arcade origin required.");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      return Response.json(await routes(request, env, ctx), { headers });
    } catch (error) {
      return Response.json({ error: error instanceof ApiError ? error.message : "The service is temporarily unavailable." }, {
        status: error instanceof ApiError ? error.status : 503, headers
      });
    }
  }
};
