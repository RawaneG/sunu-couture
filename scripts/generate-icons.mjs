import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(__dirname, "..", "public");
const pwaDir = path.join(pub, "pwa");
mkdirSync(pwaDir, { recursive: true });

const jobs = [
  { src: "icon-source.svg", out: "pwa-192.png", size: 192 },
  { src: "icon-source.svg", out: "pwa-512.png", size: 512 },
  { src: "icon-source.svg", out: "apple-touch-icon.png", size: 180 },
  { src: "icon-maskable-source.svg", out: "maskable-192.png", size: 192 },
  { src: "icon-maskable-source.svg", out: "maskable-512.png", size: 512 },
];

for (const job of jobs) {
  const src = path.join(pwaDir, job.src);
  const out = path.join(pwaDir, job.out);
  await sharp(src).resize(job.size, job.size).png().toFile(out);
  console.log("wrote", out);
}

// favicon.ico-equivalent 32x32 png fallback + root apple-touch-icon copy
await sharp(path.join(pwaDir, "icon-source.svg")).resize(180, 180).png().toFile(path.join(pub, "apple-touch-icon.png"));
console.log("done");
