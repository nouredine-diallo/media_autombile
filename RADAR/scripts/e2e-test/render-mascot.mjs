import { chromium } from 'playwright';
import fs from 'fs';

const artPath = '/home/land/media_autombile/RADAR/src/components/assistant/mascot-art.ts';
const src = fs.readFileSync(artPath, 'utf8');
const bodyMatch = src.match(/export const BODY = ({[\s\S]*?});/);
const eyesMatch = src.match(/export const EYES[^=]*=\s*({[\s\S]*?});\s*$/);
const bodyLiteral = bodyMatch[1].replace(/ as Circle/g, '');
const BODY = eval('(' + bodyLiteral + ')');
const EYES = eval('(' + eyesMatch[1] + ')');

function svgFor(state, variant = 'full') {
  const eyes = EYES[state];
  const wheels = variant === 'full'
    ? `<circle cx="${BODY.wheelLeft.cx}" cy="${BODY.wheelLeft.cy}" r="${BODY.wheelLeft.r}" fill="#8F2626"/>
       <circle cx="${BODY.wheelRight.cx}" cy="${BODY.wheelRight.cy}" r="${BODY.wheelRight.r}" fill="#8F2626"/>`
    : '';
  const antenna = variant === 'full'
    ? `<path d="${BODY.antennaStalk}" fill="#CA3E3E"/><circle cx="${BODY.antennaTip.cx}" cy="${BODY.antennaTip.cy}" r="${BODY.antennaTip.r}" fill="${state === 'happy' ? '#4ADE80' : '#DA675E'}"/>`
    : '';
  return `<svg viewBox="-150 -150 300 300" width="260" height="260" xmlns="http://www.w3.org/2000/svg" style="background:#0F1219">
    <defs><clipPath id="clip-${state}"><path d="${BODY.headPath}"/></clipPath></defs>
    ${wheels}
    <path d="${BODY.headPath}" fill="#CA3E3E"/>
    <g clip-path="url(#clip-${state})">
      <path d="${eyes.left}" fill="#2B1D1D" opacity="${eyes.leftVisible ? 1 : 0}"/>
      <path d="${eyes.right}" fill="#2B1D1D" opacity="${eyes.rightVisible ? 1 : 0}"/>
    </g>
    ${antenna}
  </svg>`;
}

const states = ['idle', 'thinking', 'happy', 'perplexed'];
const html = `<html><body style="margin:0;background:#0F1219;display:flex;flex-wrap:wrap;">
  ${states.map((s) => `<div style="padding:10px;color:white;font-family:sans-serif;text-align:center">${s} (full)<br/>${svgFor(s, 'full')}</div>`).join('')}
  ${states.map((s) => `<div style="padding:10px;color:white;font-family:sans-serif;text-align:center">${s} (face)<br/>${svgFor(s, 'face')}</div>`).join('')}
</body></html>`;
fs.writeFileSync('/tmp/claude-1000/-home-land-media-autombile/8ca52d3c-fe3b-482f-ba68-3a0dab088594/scratchpad/mascot-preview.html', html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1150, height: 620 } });
await page.goto('file:///tmp/claude-1000/-home-land-media-autombile/8ca52d3c-fe3b-482f-ba68-3a0dab088594/scratchpad/mascot-preview.html');
await page.screenshot({ path: '/tmp/claude-1000/-home-land-media-autombile/8ca52d3c-fe3b-482f-ba68-3a0dab088594/scratchpad/mascot-current.png' });
await browser.close();
console.log('done');
