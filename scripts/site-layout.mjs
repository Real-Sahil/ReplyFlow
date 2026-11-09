// After the app is built, put the website at the root and the app at /app.
//
//   dist/index.html  (the app)      -> dist/app.html, served as /app
//   dist/welcome.html (the website)  -> dist/index.html, served as /
//
// The other website pages (features, pricing, contact, blog) are copied from public/ by the build. Run it
// again and nothing changes. The folder can be named: node scripts/site-layout.mjs [dist].
import { copyFileSync, existsSync, renameSync } from "node:fs";
import path from "node:path";

const dist = path.resolve(process.argv[2] ?? "dist");
const index = path.join(dist, "index.html");
const app = path.join(dist, "app.html");
const home = path.join(dist, "welcome.html");

if (!existsSync(home)) {
  console.error(`site-layout: ${home} is missing, so there is no website to put at the root.`);
  process.exit(1);
}
if (!existsSync(app)) {
  if (!existsSync(index)) {
    console.error(`site-layout: ${index} is missing, so there is no app to move.`);
    process.exit(1);
  }
  renameSync(index, app);
}
copyFileSync(home, index);
console.warn("site-layout: website at /, app at /app");
