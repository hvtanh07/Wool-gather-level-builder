// Redesign specs, one per level. Shapes are in world units (x right, z up; board about x -3..3, z -5.6..0.5).
// Element unlocks follow the GDD: tunnel from level 7, conveyor from 12, frozen box (ice) from 17.
import { Spec, rect, diff, poly, union } from './gen';

const H = 'H' as const;
const V = 'V' as const;

export const SPECS: Spec[] = [
  {
    id: 8,
    name: 'Cổng vòm',
    challenge: 'Mở đường cho tunnel: 2 tunnel nằm dưới vòm, bus chỉ ra được khi dọn cột phía trên',
    target: 1.5,
    parts: [
      { mask: rect(-3.0, -4.4, -1.15, -2.0), orient: V, dir: 'out', pin: 0.2 },
      { mask: rect(1.15, -4.4, 3.0, -2.0), orient: V, dir: 'out', pin: 0.2 },
      { mask: rect(-3.0, -1.95, 3.0, 0.45), orient: H, dir: 'out', pin: 0.3, w: [2, 3, 2] },
    ],

    tunnels: [
      { x: -0.45, z: -4.7, out: 'up', n: 3 },
      { x: 0.45, z: -4.7, out: 'up', n: 3 },
    ],
    colors: 5,
    chunk: [4, 8],
  },
  {
    id: 10,
    name: 'Hành lang',
    challenge: 'Hard đầu tiên: tunnel trên bắn dọc hành lang có thanh chắn, tunnel bên bắn xuyên khối trái; rồng đòi màu nằm sâu',
    target: 3.5,
    parts: [
      { mask: rect(-3.0, -5.45, -0.75, 0.45), orient: V, dir: 'random' },
      { mask: rect(0.75, -5.45, 3.0, 0.45), orient: V, dir: 'random' },
      { mask: union(rect(-0.72, -1.55, 0.72, -0.85), rect(-0.72, -3.15, 0.72, -2.45), rect(-0.72, -4.75, 0.72, -4.05)), orient: H, dir: 'random', tag: 'bar' },
    ],
    tunnels: [
      { x: 0, z: 0.0, out: 'down', n: 4 },
      { x: -2.64, z: -2.0, out: 'right', n: 4 },
    ],
    colors: 5,
    chunk: [3, 6],
    minExpert: 0.9,
  },
  {
    id: 11,
    name: 'Chữ thập',
    challenge: 'Nghỉ sau level Hard: hình chữ thập mở ra 4 phía, 1 tunnel ở tâm bắn xuống nhánh dưới',
    target: 1.3,
    parts: [
      { mask: diff(rect(-1.0, -5.5, 1.0, 0.5), rect(-1.0, -3.3, 1.0, -1.7)), orient: V, dir: 'out', pin: 0.15 },
      { mask: rect(-3.05, -3.3, -1.05, -1.7), orient: H, dir: 'out', pin: 0.15 },
      { mask: rect(1.05, -3.3, 3.05, -1.7), orient: H, dir: 'out', pin: 0.15 },
    ],

    tunnels: [{ x: 0, z: -2.1, out: 'down', n: 4 }],
    colors: 5,
    chunk: [4, 8],
  },
  {
    id: 13,
    name: 'Mái che băng chuyền',
    challenge: 'Băng chuyền dưới mái: box trên băng chỉ đi lên được ở khe giữa hai khối, phải canh lúc box chạy qua khe',
    target: 1.8,
    parts: [
      { mask: rect(-3.0, -3.9, -1.0, 0.3), orient: V, dir: 'random' },
      { mask: rect(1.0, -3.9, 3.0, 0.3), orient: V, dir: 'random' },
      { mask: rect(-0.7, -1.6, 0.7, 0.3), orient: H, dir: 'out', pin: 0.3 },
    ],
    conveyors: [{ z: -4.9, n: 12, dir: 'left-to-right' }],
    colors: 5,
    chunk: [3, 7],
  },
  {
    id: 14,
    name: 'Hai đảo',
    challenge: 'Hai đảo đối mặt: box nằm ngang chĩa sang đảo kia, lấy ở đảo này để mở đường cho đảo kia',
    target: 2.2,
    parts: [
      { mask: rect(-3.0, -2.4, -0.75, -0.2), orient: H, dir: 'in', pin: 0.6 },
      { mask: rect(0.75, -2.4, 3.0, -0.2), orient: H, dir: 'in', pin: 0.6 },
      { mask: rect(-3.0, -5.2, -0.75, -2.45), orient: V, dir: 'random' },
      { mask: rect(0.75, -5.2, 3.0, -2.45), orient: V, dir: 'random' },
    ],

    tunnels: [
      { x: -1.25, z: -3.9, out: 'right', n: 3 },
      { x: 1.25, z: -1.3, out: 'left', n: 3 },
    ],

    colors: 6,
    chunk: [3, 6],
  },
  {
    id: 15,
    name: 'Củ hành + băng chuyền',
    challenge: 'Hard: vòng ngoài khóa lõi trong, rồng chia đoạn nhỏ, phải giữ slot cho màu lõi',
    target: 3.8,
    parts: [
      { mask: rect(-3.0, -0.45, 3.0, 0.4), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-3.0, -3.9, 3.0, -3.05), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-3.0, -3.0, -1.95, -0.5), orient: V, dir: 'in', pin: 0.5 },
      { mask: rect(1.95, -3.0, 3.0, -0.5), orient: V, dir: 'in', pin: 0.5 },
      { mask: rect(-1.8, -2.95, 1.8, -0.55), orient: V, dir: 'random', tag: 'core', phase: 0.5 },
    ],
    conveyors: [{ z: -4.9, n: 11, dir: 'left-to-right' }],
    colors: 6,
    chunk: [2, 4],
    minExpert: 0.9,
  },
  {
    id: 19,
    name: 'Bậc thang',
    challenge: 'Khối xếp bậc thang chéo, khe chéo cho box băng chuyền đi lên ở từng đoạn khác nhau',
    target: 2.2,
    parts: [
      { mask: poly([[-3.05, 0.5], [-1.0, 0.5], [3.05, -2.5], [3.05, -3.95], [1.0, -3.95], [-3.05, -1.0]]), orient: H, dir: 'random' },
      { mask: poly([[0.4, 0.5], [3.05, 0.5], [3.05, -1.5]]), orient: V, dir: 'random' },
      { mask: poly([[-3.05, -1.7], [-3.05, -3.95], [-0.4, -3.95]]), orient: V, dir: 'random' },
    ],

    conveyors: [{ z: -4.9, n: 12, dir: 'right-to-left' }],
    colors: 6,
    chunk: [3, 6],
  },
  {
    id: 20,
    name: 'Đồng hồ cát băng',
    challenge: 'Hard: eo đồng hồ cát bị đóng băng, phải bắn đúng box vào băng để nối hai nửa',
    target: 5.0,
    parts: [
      { mask: poly([[-3.0, 0.45], [3.0, 0.45], [0.95, -2.2], [-0.95, -2.2]]), orient: V, dir: 'in', pin: 0.5 },
      { mask: rect(-1.0, -2.9, 1.0, -2.15), orient: H, dir: 'random', tag: 'waist' },
      { mask: poly([[-0.95, -2.85], [0.95, -2.85], [3.0, -5.5], [-3.0, -5.5]]), orient: V, dir: 'in', pin: 0.5 },
    ],
    ice: 7,
    iceDeep: true,
    colors: 7,
    chunk: [2, 4],
    minExpert: 0.9,
  },
  {
    id: 21,
    name: 'Chong chóng',
    challenge: 'Mở vòng lặp (level 21): 4 cánh chong chóng mở ra ngoài, tunnel ở tâm chờ cánh trên mở',
    target: 1.5,
    parts: [
      { mask: rect(-0.7, -1.75, 3.0, -0.4), orient: H, dir: 'out', pin: 0.15, c: [0, -2.5] },
      { mask: rect(0.75, -5.0, 2.1, -1.8), orient: V, dir: 'out', pin: 0.15, c: [0, -2.5] },
      { mask: rect(-3.0, -4.6, 0.7, -3.25), orient: H, dir: 'out', pin: 0.15, c: [0, -2.5] },
      { mask: rect(-2.1, -3.2, -0.75, 0.4), orient: V, dir: 'out', pin: 0.15, c: [0, -2.5] },
    ],
    tunnels: [{ x: 0, z: -2.9, out: 'up', n: 4 }],
    colors: 5,
    chunk: [4, 8],
  },
  {
    id: 22,
    name: 'Tunnel bị khóa',
    challenge: '3 tunnel ở đáy, đường lên bị các cột box chặn, phải dọn đúng cột để tunnel nhả bus',
    target: 2.5,
    parts: [{ mask: rect(-3.0, -3.9, 3.0, 0.4), orient: V, dir: 'random', drop: 0.08 }],
    tunnels: [
      { x: -1.98, z: -4.9, out: 'up', n: 3 },
      { x: 0, z: -4.9, out: 'up', n: 3 },
      { x: 1.98, z: -4.9, out: 'up', n: 3 },
    ],
    colors: 6,
    chunk: [3, 6],
  },
  {
    id: 23,
    name: 'Tường Box10',
    challenge: 'Hai bức tường Box10 kẹp lõi Box4: box lớn chiếm slot lâu, phải chọn thứ tự để không kẹt slot',
    target: 3.0,
    parts: [
      { mask: rect(-3.0, -0.8, 3.0, 0.45), orient: H, dir: 'random', w: [0, 0, 1], tag: 'wall' },
      { mask: rect(-3.0, -5.45, 3.0, -4.2), orient: H, dir: 'random', w: [0, 0, 1], tag: 'wall' },
      { mask: rect(-3.0, -4.15, 3.0, -0.85), orient: V, dir: 'random', w: [5, 1, 0] },
    ],
    ice: 3,
    colors: 6,
    chunk: [3, 6],
  },
  {
    id: 24,
    name: 'Mũi tên',
    challenge: 'Mũi tên chỉ lên: thân giữa chặn đường băng chuyền, hai cánh mở dần từ ngoài vào',
    target: 2.2,
    parts: [
      { mask: poly([[0, 0.55], [3.05, -1.4], [3.05, -3.0], [0, -1.2], [-3.05, -3.0], [-3.05, -1.4]]), orient: V, dir: 'out', pin: 0.3 },
      { mask: rect(-0.72, -3.95, 0.72, -1.3), orient: H, dir: 'random' },
      { mask: rect(-3.05, -3.95, -1.5, -3.15), orient: H, dir: 'random' },
      { mask: rect(1.5, -3.95, 3.05, -3.15), orient: H, dir: 'random' },
    ],

    conveyors: [{ z: -4.9, n: 12, dir: 'left-to-right' }],
    colors: 6,
    chunk: [3, 6],
  },
  {
    id: 25,
    name: 'Hai tháp bắn chéo',
    challenge: 'Hard: tunnel tháp này bắn sang tháp kia, phải mở hàng đối diện trước, thêm băng chuyền và rồng vụn',
    target: 4.6,
    parts: [
      { mask: rect(-3.0, -3.9, -0.85, 0.45), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(0.85, -3.9, 3.0, 0.45), orient: H, dir: 'in', pin: 0.5 },
    ],

    tunnels: [
      { x: -1.95, z: -1.95, out: 'right', n: 4 },
      { x: 1.95, z: -3.1, out: 'left', n: 4 },
    ],
    conveyors: [{ z: -4.9, n: 11, dir: 'right-to-left' }],
    colors: 7,
    chunk: [2, 4],
    minExpert: 0.9,
  },
  {
    id: 26,
    name: 'Cầu băng',
    challenge: 'Hai đảo nối bằng cầu băng: phá băng trên cầu bằng box cùng hàng',
    target: 2.0,
    parts: [
      { mask: rect(-3.0, -5.0, -1.3, 0.4), orient: V, dir: 'random' },
      { mask: rect(1.3, -5.0, 3.0, 0.4), orient: V, dir: 'random' },
      { mask: rect(-1.25, -3.3, 1.25, -1.5), orient: H, dir: 'random', tag: 'bridge' },
    ],

    ice: 3,
    iceTag: 'bridge',
    colors: 5,
    chunk: [3, 7],
  },
  {
    id: 27,
    name: 'Bẫy màu',
    challenge: 'Vòng ngoài toàn box rảnh nhưng màu nằm cuối rồng: lấy bừa là đầy slot, chỉ lấy box mở lối vào lõi',
    target: 2.4,
    parts: [
      { mask: rect(-2.6, -1.15, 2.6, 0.05), orient: H, dir: 'out', pin: 0.1, tag: 'ring' },
      { mask: rect(-2.6, -4.85, 2.6, -3.65), orient: H, dir: 'out', pin: 0.1, tag: 'ring' },
      { mask: rect(-2.6, -3.6, -1.45, -1.2), orient: V, dir: 'out', pin: 0.1, tag: 'ring' },
      { mask: rect(1.45, -3.6, 2.6, -1.2), orient: V, dir: 'out', pin: 0.1, tag: 'ring' },
      { mask: rect(-1.4, -3.6, 1.4, -1.2), orient: V, dir: 'random', tag: 'core', phase: 0.5 },
    ],
    late: ['ring'],
    colors: 7,
    chunk: [2, 4],
  },
  {
    id: 28,
    name: 'Củ hành 3 lớp',
    challenge: 'Ba lớp lồng nhau, lõi đóng băng: bóc từng lớp, giữ box để phá băng lõi',
    target: 3.2,
    parts: [
      { mask: rect(-3.0, -0.55, 3.0, 0.45), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-3.0, -5.45, 3.0, -4.45), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-3.0, -4.4, -2.05, -0.6), orient: V, dir: 'in', pin: 0.5 },
      { mask: rect(2.05, -4.4, 3.0, -0.6), orient: V, dir: 'in', pin: 0.5 },
      { mask: rect(-2.0, -1.55, 2.0, -0.6), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-2.0, -4.4, 2.0, -3.45), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-2.0, -3.4, -1.05, -1.6), orient: V, dir: 'in', pin: 0.5 },
      { mask: rect(1.05, -3.4, 2.0, -1.6), orient: V, dir: 'in', pin: 0.5 },
      { mask: rect(-1.0, -3.4, 1.0, -1.6), orient: V, dir: 'random', tag: 'core', phase: 0.5 },
    ],
    ice: 3,
    iceTag: 'core',
    colors: 6,
    chunk: [3, 5],
  },
  {
    id: 29,
    name: 'Bàn cờ',
    challenge: 'Ô bàn cờ xen dọc/ngang: mỗi ô chặn ô bên cạnh theo một hướng, băng chuyền đi qua các khe',
    target: 2.5,
    parts: (() => {
      const parts = [];
      const xs = [-2.95, -1.5, 0.05, 1.55];
      const zs = [0.35, -1.05, -2.45];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++) {
          const vert = (i + j) % 2 === 0;
          parts.push({ mask: rect(xs[i], zs[j] - 1.35, xs[i] + 1.4, zs[j]), orient: vert ? V : H, dir: 'random' as const });
        }
      return parts;
    })(),
    conveyors: [{ z: -4.9, n: 12, dir: 'left-to-right' }],
    colors: 6,
    chunk: [3, 6],
  },
  {
    id: 30,
    name: 'Pháo đài',
    challenge: 'Hard: 2 tunnel trong sân bắn ra hai bên tường, góc tường đóng băng, rồng vụn 7 màu',
    target: 5.2,
    parts: [
      { mask: rect(-3.0, -0.85, 3.0, 0.45), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-3.0, -5.45, 3.0, -4.15), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-3.0, -4.1, -1.65, -0.9), orient: V, dir: 'random' },
      { mask: rect(1.65, -4.1, 3.0, -0.9), orient: V, dir: 'random' },
      { mask: rect(-1.6, -1.85, 1.6, -0.95), orient: H, dir: 'random', tag: 'yard' },
      { mask: rect(-1.6, -4.05, 1.6, -3.2), orient: H, dir: 'random', tag: 'yard' },
    ],

    tunnels: [
      { x: -0.45, z: -2.5, out: 'left', n: 4 },
      { x: 0.45, z: -2.5, out: 'right', n: 4 },
    ],
    ice: 5,
    iceDeep: true,
    colors: 7,
    chunk: [2, 4],
    minExpert: 0.9,
  },
  {
    id: 31,
    name: 'Xoắn ốc',
    challenge: 'Dải box xoắn ốc vào tâm, tunnel ở tâm phải chờ 2 vòng phía trên mở; box đi ngang qua khe xoắn',
    target: 2.5,
    parts: [
      { mask: rect(-3.0, -0.25, 3.0, 0.45), orient: H, dir: 'random' },
      { mask: rect(2.3, -5.45, 3.0, -0.3), orient: V, dir: 'random' },
      { mask: rect(-3.0, -5.45, 2.25, -4.75), orient: H, dir: 'random' },
      { mask: rect(-3.0, -4.7, -2.3, -1.0), orient: V, dir: 'random' },
      { mask: rect(-2.25, -1.65, 1.65, -0.95), orient: H, dir: 'random' },
      { mask: rect(0.95, -4.1, 1.65, -1.7), orient: V, dir: 'random' },
      { mask: rect(-1.65, -4.15, 0.9, -3.45), orient: H, dir: 'random' },
      { mask: rect(-1.65, -3.4, -0.95, -2.2), orient: V, dir: 'random' },
    ],
    tunnels: [{ x: 0, z: -2.75, out: 'up', n: 4 }],
    colors: 6,
    chunk: [3, 6],
  },

  {
    id: 33,
    name: 'Dây chuyền băng',
    challenge: 'Băng nằm sâu trong cột: phải mở cột trước, rồi mới có box bắn trúng băng',
    target: 3.2,
    parts: [
      { mask: rect(-3.0, -1.95, 3.0, 0.4), orient: V, dir: 'random' },
      { mask: rect(-3.0, -2.95, 3.0, -2.0), orient: H, dir: 'random', tag: 'band' },
      { mask: rect(-3.0, -5.4, 3.0, -3.0), orient: V, dir: 'random', phase: 0.5 },
    ],
    ice: 6,
    iceDeep: true,
    colors: 6,
    chunk: [3, 5],
  },
  {
    id: 34,
    name: 'Kim tự tháp',
    challenge: 'Tháp bậc ngang: đỉnh tháp là màu cuối rồng, phải mở từ hai bên sườn',
    target: 2.2,
    parts: [
      { mask: poly([[-3.05, -5.0], [3.05, -5.0], [0, 0.55]]), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-0.7, -1.3, 0.7, 0.55), orient: V, dir: 'random', tag: 'top' },
    ],
    late: ['top'],
    colors: 6,
    chunk: [3, 6],
  },
  {
    id: 35,
    name: 'Hai băng chuyền',
    challenge: 'Hard: băng trên luôn lấy được, băng dưới bị khối giữa che; rồng vụn, phải chia slot giữa hai băng',
    target: 5.3,
    parts: [
      { mask: rect(-3.0, -3.85, 3.0, -1.1), orient: V, dir: 'in', pin: 0.5, drop: 0.05 },
    ],

    conveyors: [
      { z: -0.4, n: 10, dir: 'right-to-left' },
      { z: -4.9, n: 11, dir: 'left-to-right' },
    ],
    ice: 6,
    iceDeep: true,
    colors: 8,
    chunk: [2, 3],
    minExpert: 0.9,
  },
  {
    id: 37,
    name: 'Chong chóng băng',
    challenge: 'Chong chóng quay ngược, đầu cánh đóng băng: phá băng từ trong ra',
    target: 3.2,
    parts: [
      { mask: rect(-3.0, -1.75, 0.7, -0.4), orient: H, dir: 'out', pin: 0.3, c: [0, -2.5], tag: 'arm' },
      { mask: rect(-2.1, -5.0, -0.75, -1.8), orient: V, dir: 'out', pin: 0.3, c: [0, -2.5], tag: 'arm' },
      { mask: rect(-0.7, -4.6, 3.0, -3.25), orient: H, dir: 'out', pin: 0.3, c: [0, -2.5], tag: 'arm' },
      { mask: rect(0.75, -3.2, 2.1, 0.4), orient: V, dir: 'out', pin: 0.3, c: [0, -2.5], tag: 'arm' },
      { mask: rect(-0.7, -3.2, 0.7, -1.8), orient: V, dir: 'random', phase: 0.5 },
    ],
    ice: 5,
    iceTag: 'arm',
    colors: 6,
    chunk: [3, 5],
  },
  {
    id: 38,
    name: 'Ngã tư tunnel',
    challenge: '4 tunnel ở tâm bắn ra 4 hướng, mỗi hướng bị một khối chặn: chọn hướng nào mở trước',
    target: 3.0,
    parts: [
      { mask: rect(-3.0, -2.45, 3.0, 0.45), orient: H, dir: 'random' },
      { mask: rect(-3.0, -5.45, 3.0, -2.5), orient: V, dir: 'random' },
    ],
    tunnels: [
      { x: 0, z: -1.6, out: 'up', n: 3 },
      { x: 0, z: -3.4, out: 'down', n: 3 },
      { x: -0.8, z: -2.5, out: 'left', n: 3 },
      { x: 0.8, z: -2.5, out: 'right', n: 3 },
    ],
    colors: 6,
    chunk: [3, 5],
  },
  {
    id: 40,
    name: 'Lâu đài',
    challenge: 'Hard cuối vòng: tường băng, 2 tunnel bắn ra tường, băng chuyền dưới chân, rồng vụn 8 màu',
    target: 5.8,
    parts: [
      { mask: rect(-3.0, -0.45, 3.0, 0.45), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-3.0, -3.9, 3.0, -3.05), orient: H, dir: 'in', pin: 0.5 },
      { mask: rect(-3.0, -3.0, -1.65, -0.5), orient: V, dir: 'random' },
      { mask: rect(1.65, -3.0, 3.0, -0.5), orient: V, dir: 'random' },
      { mask: rect(-1.6, -1.35, 1.6, -0.5), orient: H, dir: 'random', tag: 'yard' },
    ],

    tunnels: [
      { x: -0.45, z: -1.95, out: 'left', n: 4 },
      { x: 0.45, z: -1.95, out: 'right', n: 4 },
    ],
    conveyors: [{ z: -4.9, n: 11, dir: 'left-to-right' }],
    ice: 5,
    iceDeep: true,
    colors: 8,
    chunk: [2, 3],
    minExpert: 0.9,
  },
];
