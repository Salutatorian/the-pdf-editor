import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="180" fill="#1a1d21"/>
  <rect x="220" y="160" width="584" height="704" rx="40" fill="#2a2f36" stroke="#3d9cf0" stroke-width="24"/>
  <text x="512" y="500" text-anchor="middle" font-family="Georgia, serif" font-size="200" font-weight="700" fill="#e8eaed">JW</text>
  <text x="512" y="640" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="96" font-weight="600" fill="#3d9cf0">PDF</text>
</svg>`

await sharp(Buffer.from(svg)).png().toFile('app-icon.png')
writeFileSync('app-icon.svg', svg)
console.log('Wrote app-icon.png')
