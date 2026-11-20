# unlocked
The unlocked vault of all your favorite games.

[Play Unlocked](https://unlockedsite.github.io/unlocked/)

The arcade is published from `main /docs` on GitHub Pages. Minecraft: Story Mode is featured. The library sorts titles alphabetically, saves bookmarks and appearance on the current device, and loads a game only when someone starts it. The Chromebook spec labels are estimates. Individual ports determine their own controls, save support, and touch compatibility. Fullscreen requests native browser fullscreen. On ChromeOS the game keeps its starting viewport while the player scales to fit the screen. High-demand games default to a maximum player size of 1280 by 720 CSS pixels, adjustable before launch. Games with their own fixed render resolution may see no change.

## Game catalog

Edit `docs/games.json` for titles, aliases, sources, and port notes. Add a landscape image in `docs/assets/covers`, a portrait in `docs/assets/posters`, and the play URL in `service/ports.json`. Redeploy the service after changing either registry. New entries use the right-hand source project from the upstream catalog, share one card across alternate ports, and require title-specific preview artwork. “Ready to play” shows browser launches. “All catalog games” also includes projects awaiting a compatible build. Game cards load in groups of 48.

Geometry Dash, Among Us, and Bendy have pinned podium positions. The remaining titles rank by actual launches and then alphabetically to break ties. The live chart refreshes every 30 seconds while visible. Playing-now counts use anonymous per-launch sessions. The visible player renews its session every 30 seconds. Leaving the game clears it, and interrupted sessions expire from the count after 90 seconds.

Publisher and artist credits appear on the site's Credits page. The MIT-licensed browser engine for The Simpsons: Hit & Run lives in `docs/imports/hit-and-run`, with its license and dependency notices. It loads game data from the port author's host. Happy Wheels uses the original Jim Bonacci demo and the open-source Ruffle player. Duke Nukem 3D uses the shareware episode. The Fallout engines and the Skate 3 fan game need files from the player's own game. Call of Duty: Black Ops Zombies requires a cross-origin-isolated top-level browser window, so its card explains the limitation in place. Other game launches stay inside the arcade. Voluntary source links are available in each game’s port details.

## Reports and requests

The Pages site calls a separate Worker. Keep `BUG_HOOK`, `REQUEST_HOOK`, and `RATE_SALT` in its secret store. The Worker uses its `DB` D1 binding for play totals, active sessions, expiring rate limits, and request receipts. The database migrations are under `service/drizzle`. A submitted search sends a Discord message only if the full catalog has no match. The Worker waits for a Discord message ID before confirming delivery, and suppresses repeated title requests for 24 hours after success. Reports include the originating arcade page, selected game, issue description, optional browser family and OS, and a category-specific first check.

Use Node 22.13 or later and pnpm to work on the service. Run `pnpm install`, `pnpm test`, and `pnpm run build:service`. The build produces `dist/server/index.js`. Deploy that module, the D1 binding, and the versioned migrations together. The live deployment uses the Sites Worker runtime. Rebuilding or committing to Pages alone does not update the Worker.

## Optional key access

The arcade is free. The launch service defaults to `ACCESS_MODE=free`. To enable keys later, generate each private key locally with `node scripts/new-access-key.mjs`. Give the key to its holder. Store only its SHA-256 digest in the comma-separated `ACCESS_KEY_HASHES` server secret, add a random `SESSION_SECRET` of at least 32 bytes, and set `ACCESS_MODE=key`. Redeploy the Worker. It verifies a signed one-hour session on every portal launch. Removing a digest revokes that key and its sessions when the configuration takes effect.

GitHub Pages files and upstream game URLs are public. The launch gate controls access through this portal. Future paid assets require distribution rights and private storage with authorization on every protected asset request. No billing is enabled.
