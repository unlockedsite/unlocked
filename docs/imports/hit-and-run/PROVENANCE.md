# The Simpsons: Hit & Run browser engine

Original browser reconstruction by Dwayne Charrington. Source and build instructions: https://github.com/vheissu/hit-and-run-web/tree/94800b3436df05dee92e52e70c2bdaa8d9ee8420

This directory contains the MIT-licensed browser launcher, compiled JavaScript, stylesheet and notices. Gameplay data, original artwork, music, audio and mission scripts remain on the upstream Pages deployment. The MIT license covers the original project code only.

The compiled code comes from the corresponding upstream GitHub Pages deployment for commit 94800b3436df05dee92e52e70c2bdaa8d9ee8420. The two JavaScript dependencies in this build are three 0.185.1 and three-mesh-bvh 0.9.14. Their notices are in THIRD-PARTY.txt.

Local changes: the HTML names the two local code files and loads its image URLs from the original host. The compiled engine’s single data-path prefix, also defined by assetURL in src/assets.ts, points to the original Pages host. The launcher adds a restrictive Content Security Policy. Game behavior and controls are unchanged.

Player: https://vheissu.github.io/hit-and-run-web/
Original engine file: https://vheissu.github.io/hit-and-run-web/assets/index-x-2tLYZb.js
Original engine SHA-256: 65e53a4262d03dd4e432e7c55c42b7f25c4d6bea3fc70eed7afdb937b1a265be
Local engine SHA-256: 8599eb966c1fd9338c072bb6f61bf17f65d54252bb04a838f2d34bbc0152cc3a
Original stylesheet: https://vheissu.github.io/hit-and-run-web/assets/index-D15Hcr2e.css

The original game data is not included. Keep the NOTICES with these files. The author makes no claim to the original characters or game assets, and this integration does not grant rights to charge for those assets.
