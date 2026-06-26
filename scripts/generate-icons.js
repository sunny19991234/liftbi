// node scripts/generate-icons.js
// Requires: npm install --save-dev sharp
import sharp from 'sharp';
import { createCanvas } from 'canvas';
import { mkdirSync } from 'fs';

const SIZES = [192, 512];
const BG = '#15171A';
const ACCENT = '#FF4B3E';
const TEXT = '#EDEEF0';

mkdirSync('public/icons', { recursive: true });

for (const size of SIZES) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);

  // Safe zone = 80% of canvas
  const safeSize = size * 0.8;
  const offset = (size - safeSize) / 2;

  const fontSize = Math.round(size * 0.22);
  ctx.font = `600 ${fontSize}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw "Lift" in white
  const liftWidth = ctx.measureText('Lift').width;
  const biWidth = ctx.measureText('BI').width;
  const totalWidth = liftWidth + biWidth;
  const startX = size / 2 - totalWidth / 2;

  ctx.fillStyle = TEXT;
  ctx.fillText('Lift', startX + liftWidth / 2, size / 2);

  ctx.fillStyle = ACCENT;
  ctx.fillText('BI', startX + liftWidth + biWidth / 2, size / 2);

  const buffer = canvas.toBuffer('image/png');
  await sharp(buffer)
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`);

  console.log(`Generated public/icons/icon-${size}.png`);
}
