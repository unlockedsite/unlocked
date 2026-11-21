const repository = "unlockedsite/unlocked";
const role = "1573417503856525323";
const priorDeployment = 7950404824;
const arcade = "https://unlockedsite.github.io/unlocked/";
const releases = "arcade_announcements";

async function prepareNotes(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS arcade_release_notes (
    version INTEGER PRIMARY KEY, notes TEXT NOT NULL, published TEXT NOT NULL
  )`).run();
}

export async function publishedUpdates(env) {
  await prepareNotes(env.DB);
  const {results} = await env.DB.prepare(`SELECT a.version,a.sha,n.notes,n.published
    FROM arcade_announcements a LEFT JOIN arcade_release_notes n ON a.version=n.version
    WHERE a.receipt IS NOT NULL ORDER BY a.version DESC LIMIT 5`).all();
  const previousNotes = {
    "96b5dc0d4875ef7c7387a752b72ce4aef9ee6ba6": "• Added a game request page beside Discord.\n• Updated the featured carousel with widescreen artwork and timed controls.\n• Ranked games by playtime and removed the broken Cuphead port.",
    "4f28bdeabd735c7922fb38b7eec55886f79752d8": "• Add an optional spotlight tour and remove Block Blast from the arcade"
  };
  return {updates:results.map(row=>({version:"1."+row.version, notes:row.notes || previousNotes[row.sha] || "• Published arcade improvements.", published:row.published, url:"https://github.com/"+repository+"/commit/"+row.sha}))};
}

async function github(path) {
  const res = await fetch("https://api.github.com/repos/" + repository + path, {
    headers: { "User-Agent": "Unlocked-Release-Notes", Accept: "application/vnd.github+json" }
  });
  if (!res.ok) throw Error("GitHub verification unavailable");
  return res.json();
}

// Callers can supply only a deployment ID. All message content comes from this repository.
export async function announce(id, env) {
  if (!/^\d{1,16}$/.test(id) || Number(id) <= priorDeployment) return Response.json({skipped:true});
  const db = env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS ${releases} (
    version INTEGER PRIMARY KEY, deployment TEXT UNIQUE NOT NULL,
    sha TEXT UNIQUE NOT NULL, receipt TEXT
  )`).run();
  const existing = await db.prepare(`SELECT receipt,version FROM ${releases} WHERE deployment=?`).bind(id).first();
  if (existing?.receipt) return Response.json({version:existing.version, delivered:!!existing.receipt}, {status:existing.receipt?200:503});
  const deployment = await github("/deployments/"+id);
  if (deployment.environment !== "github-pages" || deployment.ref !== "main" || !/^[0-9a-f]{40}$/.test(deployment.sha)) return Response.json({skipped:true});
  const statuses = await github("/deployments/"+id+"/statuses");
  if (!statuses.some(s=>s.state==="success")) return Response.json({skipped:true});
  const sha = deployment.sha;
  if (await db.prepare(`SELECT 1 FROM ${releases} WHERE sha=? AND receipt IS NOT NULL`).bind(sha).first()) return Response.json({duplicate:true});
  const prior = await db.prepare(`SELECT sha FROM ${releases} WHERE receipt IS NOT NULL ORDER BY version DESC LIMIT 1`).first();
  let notes = "• Added a game request page beside Discord.\n• Updated the featured carousel with widescreen artwork and timed controls.\n• Ranked games by playtime and removed the broken Cuphead port.";
  if (prior) {
    const diff = await github("/compare/"+prior.sha+"..."+sha);
    if (diff.status !== "ahead") return Response.json({skipped:true});
    const titles = diff.commits.map(c=>c.commit.message.split("\n")[0]).filter(s=>!/^Merge (pull request|branch|remote-tracking)/.test(s));
    notes = [...new Set(titles)].slice(-8).map(s=>"• "+s.slice(0,110)).join("\n") || "• Published the latest arcade changes.";
  }
  const row = existing || await db.prepare(`INSERT OR IGNORE INTO ${releases}(version,deployment,sha)
    SELECT COALESCE(MAX(version),0)+1,?,? FROM ${releases}
    HAVING COUNT(*)=COUNT(receipt) RETURNING version`).bind(id,sha).first();
  if (!row) return Response.json({busy:true},{status:503});
  // A short claim lets a later workflow resume an interrupted delivery.
  await db.prepare("CREATE TABLE IF NOT EXISTS arcade_announcement_claims (deployment TEXT PRIMARY KEY, until_time INTEGER NOT NULL)").run();
  const claim = await db.prepare(`INSERT INTO arcade_announcement_claims VALUES (?,unixepoch()+600)
    ON CONFLICT(deployment) DO UPDATE SET until_time=excluded.until_time
    WHERE until_time<=unixepoch() RETURNING deployment`).bind(id).first();
  if (!claim) return Response.json({busy:true},{status:503});
  if ((await db.prepare(`SELECT receipt FROM ${releases} WHERE deployment=?`).bind(id).first())?.receipt)
    return Response.json({duplicate:true});
  const version = "1."+row.version;
  const published = statuses.find(s=>s.state==="success").created_at;
  await prepareNotes(db);
  await db.prepare("INSERT INTO arcade_release_notes(version,notes,published) VALUES (?,?,?) ON CONFLICT(version) DO UPDATE SET notes=excluded.notes,published=excluded.published")
    .bind(row.version,notes,published).run();
  const url = new URL(env.UPDATE_HOOK);
  url.searchParams.set("wait","true");
  const result = await fetch(url, {method:"POST",redirect:"manual",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    content:"<@&"+role+">",allowed_mentions:{parse:[],roles:[role]},
    embeds:[{title:"Unlocked | Update v"+version,url:arcade,color:0xFFD05B,
      description:notes,fields:[{name:"Play the update",value:"[Open Unlocked]("+arcade+") · [View changes](https://github.com/"+repository+"/commit/"+sha+")"}],
      footer:{text:"Unlocked Arcade • Release notes"},timestamp:published}]
  })});
  if (!result.ok) {
    if (result.status>=400 && result.status<500) await db.prepare(`DELETE FROM ${releases} WHERE deployment=? AND receipt IS NULL`).bind(id).run();
    return Response.json({error:"Discord delivery not confirmed"},{status:503});
  }
  const receipt = (await result.json()).id;
  if (!/^\d{15,21}$/.test(receipt)) throw Error("Discord receipt missing");
  await db.prepare(`UPDATE ${releases} SET receipt=? WHERE deployment=?`).bind(receipt,id).run();
  return Response.json({version,receipt});
}
