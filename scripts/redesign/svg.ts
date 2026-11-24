// Renders a level to SVG (board, tunnels, conveyors, ice, arrows) for review.
import { CleanLevelData, BoxItem } from '../../src/types/level';
import { BOX_DIMENSIONS, WOOL_COLORS } from '../../src/utils/colors';
import { getTunnelReadyBox } from '../../src/utils/collision';

const S = 40; // px per unit
const X0 = -3.6, X1 = 3.6, Z0 = -6.2, Z1 = 1.2;
const px = (x: number) => (x - X0) * S;
const pz = (z: number) => (Z1 - z) * S;

function boxSvg(b: BoxItem, extra = '') {
  const d = BOX_DIMENSIONS[b.numType] || BOX_DIMENSIONS.Box6;
  const col = WOOL_COLORS[b.color]?.hex ?? '#888';
  const w = d.width * S, l = d.length * S;
  const ice = b.boxType === 'Ice';
  // svg rotation: angle 0 = up
  return `<g transform="translate(${px(b.x)},${pz(b.z)}) rotate(${b.angle})">
<rect x="${-w / 2}" y="${-l / 2}" width="${w}" height="${l}" rx="4" fill="${col}" stroke="${ice ? '#bfefff' : '#111'}" stroke-width="${ice ? 3 : 1}" ${extra}/>
${ice ? `<rect x="${-w / 2 + 2}" y="${-l / 2 + 2}" width="${w - 4}" height="${l - 4}" rx="3" fill="#bfefff" opacity="0.45"/>` : ''}
<path d="M0 ${-l / 2 + 4} L${-w / 4} ${-l / 2 + 12} M0 ${-l / 2 + 4} L${w / 4} ${-l / 2 + 12} M0 ${-l / 2 + 4} L0 ${l / 2 - 6}" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
<text x="0" y="${l / 2 - 3}" font-size="8" fill="#fff" text-anchor="middle" font-family="sans-serif">${b.capacity}</text>
</g>`;
}

export function levelSvg(l: CleanLevelData, title = '') {
  const W = (X1 - X0) * S, H = (Z1 - Z0) * S;
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#1b2234"/>`);
  parts.push(`<rect x="${px(-2.6)}" y="0" width="${5.2 * S}" height="${H}" fill="#ffffff" opacity="0.03"/>`);
  for (const c of l.conveyors || []) {
    parts.push(`<rect x="${px(-4.5)}" y="${pz(c.z + 0.75)}" width="${9 * S}" height="${1.1 * S}" fill="#334" stroke="#556"/>`);
    parts.push(`<rect x="${px(c.activeZoneMinX)}" y="${pz(c.z + 0.75)}" width="${(c.activeZoneMaxX - c.activeZoneMinX) * S}" height="${1.1 * S}" fill="none" stroke="#9fd" stroke-dasharray="4 3"/>`);
    for (const b of c.boxes) parts.push(boxSvg(b, 'opacity="0.85"'));
  }
  for (const t of l.tunnels || []) {
    const d = BOX_DIMENSIONS.Box6;
    parts.push(`<g transform="translate(${px(t.x)},${pz(t.z)}) rotate(${t.angle})"><rect x="${-d.width / 2 * S}" y="${-d.length / 2 * S}" width="${d.width * S}" height="${d.length * S}" fill="#6b4e9b" stroke="#c9b6ff" stroke-width="2" rx="3"/><text x="0" y="4" font-size="11" fill="#fff" text-anchor="middle" font-family="sans-serif" transform="rotate(${-t.angle})">${t.queue.length}</text></g>`);
    const rb = getTunnelReadyBox(t);
    if (rb) parts.push(boxSvg(rb));
  }
  for (const b of l.boxes) parts.push(boxSvg(b));
  if (title) parts.push(`<text x="8" y="18" font-size="14" fill="#fff" font-family="sans-serif">${title}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('\n')}</svg>`;
}
