import { build } from "esbuild";

await build({
  entryPoints: ["service/index.mjs"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "dist/server/index.js",
  legalComments: "none"
});
