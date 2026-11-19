// Run locally only when issuing a future key. The server stores only its digest.
import { createHash, randomBytes } from "node:crypto";
const key = randomBytes(32).toString("base64url");
console.log("Private access key:", key);
console.log("Server digest for ACCESS_KEY_HASHES:", createHash("sha256").update(key).digest("hex"));
