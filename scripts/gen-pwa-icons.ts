// Generate PWA icons (run: bun scripts/gen-pwa-icons.ts)
import sharp from "sharp";
import fs from "fs/promises";

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbbf24"/>
      <stop offset="1" stop-color="#d97706"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g fill="#ffffff">
    <path d="M136 292v-14c0-84 54-138 120-138s120 54 120 138v14z"/>
    <rect x="108" y="296" width="296" height="44" rx="22"/>
    <rect x="236" y="106" width="40" height="56" rx="12"/>
  </g>
  <g fill="#ffffff" opacity="0.95">
    <rect x="164" y="382" width="184" height="28" rx="14"/>
    <rect x="196" y="424" width="120" height="28" rx="14"/>
  </g>
</svg>`;

const monochromeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g fill="#000000">
    <path d="M136 292v-14c0-84 54-138 120-138s120 54 120 138v14z"/>
    <rect x="108" y="296" width="296" height="44" rx="22"/>
    <rect x="236" y="106" width="40" height="56" rx="12"/>
    <rect x="164" y="382" width="184" height="28" rx="14"/>
    <rect x="196" y="424" width="120" height="28" rx="14"/>
  </g>
</svg>`;

const outputs = [
  { file: "public/icon-192.png", svg: iconSvg, size: 192 },
  { file: "public/icon-512.png", svg: iconSvg, size: 512 },
  { file: "public/apple-touch-icon.png", svg: iconSvg, size: 180 },
  { file: "public/favicon.png", svg: iconSvg, size: 48 },
  { file: "public/icon-maskable-192.png", svg: iconSvg, size: 192 },
  { file: "public/icon-maskable-512.png", svg: iconSvg, size: 512 },
];

await fs.mkdir("public", { recursive: true });
for (const { file, svg, size } of outputs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
