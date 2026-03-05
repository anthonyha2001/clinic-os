import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateSVGIcon(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#1E3A5F"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
    font-family="system-ui,sans-serif" font-weight="bold"
    font-size="${size * 0.35}" fill="white">C</text>
</svg>`;
  return svg;
}

async function main() {
  const dir = join(process.cwd(), "public", "icons");
  await mkdir(dir, { recursive: true });

  for (const size of sizes) {
    const svg = await generateSVGIcon(size);
    await writeFile(join(dir, `icon-${size}x${size}.svg`), svg);
    console.log(`Generated icon-${size}x${size}.svg`);
  }

  console.log("Icons generated in public/icons/");
  console.log("Note: For production, replace SVG icons with proper PNG icons.");
}

main().catch(console.error);
