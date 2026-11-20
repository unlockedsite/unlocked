import test from "node:test";
import assert from "node:assert/strict";
import games from "../docs/games.json" with {type:"json"};
import {existsSync,readFileSync} from "node:fs";
import ports from "../service/ports.json" with {type:"json"};
import {normalize} from "../docs/search.mjs";
import service from "../service/index.mjs";

test("titles, search aliases and IDs identify one game", () => {
  const names = new Map();
  assert.equal(new Set(games.map(game => game.id)).size, games.length);
  for (const game of games) {
    assert.match(game.id, /^[a-z0-9-]+$/);
    for (const name of [game.id, game.title, ...(game.aliases || [])]) {
      const key = normalize(name).replaceAll(" ", "");
      assert.notEqual(key, "raft");
      if (names.has(key)) assert.equal(names.get(key), game.id, name);
      names.set(key, game.id);
    }
  }
});

test("the service supplies every advertised launch and rejects unavailable entries", async () => {
  for (const game of games) {
    const request = new Request("https://test.invalid/v1/launch/" + game.id, {
      method: "POST", headers: {Origin: "https://unlockedsite.github.io", "Content-Type": "application/json"}, body: "{}"
    });
    const result = await service.fetch(request, {});
    if (game.mode === "embed") {
      assert.equal(result.status, 200, game.id);
      assert.equal((await result.json()).url, ports[game.id].url);
    } else {
      assert.ok([404, 409].includes(result.status), game.id);
    }
    if (game.imported) assert.ok(game.sources.length, game.id);
  }
});

test("a free Pages release ships the same launch URLs as the service", () => {
  const file = new URL("../docs/free-launches.json", import.meta.url);
  if (existsSync(file)) assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), ports);
});
