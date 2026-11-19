# unlocked
The unlocked vault of all your favorite games.

[Play Unlocked](https://unblocker0.github.io/unlocked/)

The arcade is published from `main /docs` on GitHub Pages. Minecraft: Story Mode is featured. The library sorts titles alphabetically, saves bookmarks and appearance on the current device, and loads a game only when someone starts it. The Chromebook spec labels are estimates. Individual ports determine their own controls, save support, and touch compatibility.

## Game catalog

Edit `docs/games.json` for titles, aliases, cover IDs, sources, and port notes. Add the play URL to `service/ports.json` and redeploy the service after changing either registry. The Top games chart counts intentional launches and refreshes every 45 seconds while visible. Geometry Dash, Among Us, and Bendy have pinned podium positions. The remaining titles rank by actual launches and then alphabetically to break ties.

Publisher and artist credits appear on the site's Credits page. The MIT-licensed browser engine for The Simpsons: Hit & Run lives in `docs/imports/hit-and-run`, with its license and dependency notices. It loads game data from the port author's host. Other games use upstream players. The Fallout engines and the Skate 3 fan game need files from the player's own game.

## Reports and requests

The Pages site calls a separate Worker. Keep `BUG_HOOK`, `REQUEST_HOOK`, and `RATE_SALT` in its secret store. The Worker uses its `DB` D1 binding for play totals, expiring rate limits, and request receipts. The database migrations are under `service/drizzle`. A submitted search sends a Discord message only if the full catalog has no match. The Worker suppresses repeated requests for a title for 24 hours after delivery. Reports include the originating arcade page, selected game, issue description, optional browser family and OS, and a category-specific first check.

Use Node 22.13 or later and pnpm to work on the service. Run `pnpm install`, `pnpm test`, and `pnpm run build:service`. The build produces `dist/server/index.js`. Deploy that module, the D1 binding, and the versioned migrations together. The live deployment uses the Sites Worker runtime. Rebuilding or committing to Pages alone does not update the Worker.

## Optional key access

The arcade is free. The launch service defaults to `ACCESS_MODE=free`. To enable keys later, generate each private key locally with `node scripts/new-access-key.mjs`. Give the key to its holder. Store only its SHA-256 digest in the comma-separated `ACCESS_KEY_HASHES` server secret, add a random `SESSION_SECRET` of at least 32 bytes, and set `ACCESS_MODE=key`. Redeploy the Worker. It verifies a signed one-hour session on every portal launch. Removing a digest revokes that key and its sessions when the configuration takes effect.

GitHub Pages files and upstream game URLs are public. The launch gate controls access through this portal. Future paid assets require distribution rights and private storage with authorization on every protected asset request. No billing is enabled.
