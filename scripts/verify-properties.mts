// Engineering verification of section properties against hand calculations.
// Run: node --experimental-strip-types scripts/verify-properties.mts
import { computeSectionProperties, computeComponentTorsion } from '../src/engine/geometry.ts';
import type { SectionComponent, SectionProperties } from '../src/engine/types.ts';

let failures = 0;
function check(name: string, actual: number, expected: number, relTol = 1e-6, absTol = 1e-9) {
  const diff = Math.abs(actual - expected);
  const tol = Math.max(absTol, Math.abs(expected) * relTol);
  if (diff > tol) {
    console.error(`FAIL ${name}: actual=${actual} expected=${expected} (diff=${diff} > tol=${tol})`);
    failures++;
  } else {
    console.log(`ok   ${name}: ${actual.toPrecision(8)}`);
  }
}
function checkTrue(name: string, cond: boolean, detail = '') {
  if (!cond) { console.error(`FAIL ${name} ${detail}`); failures++; } else console.log(`ok   ${name}`);
}

let uid = 0;
function mkComp(geometry: SectionComponent['geometry'], type: SectionComponent['type'] = 'rectangle', operation = 'add'): SectionComponent {
  return {
    id: `t${++uid}`, name: 'test', type, geometry, position: { x: 0, y: 0 },
    rotation: 0, operation, materialId: 'm', visible: true, locked: false,
  };
}

// ─── Test 1: Rectangle 200 (x) × 300 (y) ──────────────────────────────────
{
  const r = computeSectionProperties([mkComp({ width: 200, height: 300 })]).props;
  const A = 60000, Ix = 200 * 300 ** 3 / 12, Iy = 300 * 200 ** 3 / 12;
  check('rect A', r.area, A);
  check('rect centroidX', r.centroidX, 0);
  check('rect centroidY', r.centroidY, 0);
  check('rect Ix', r.Ix, Ix);
  check('rect Iy', r.Iy, Iy);
  check('rect Ixy≈0', r.Ixy, 0, 1e-6, 1e-3);
  check('rect rx', r.rx, Math.sqrt(Ix / A));
  check('rect ry', r.ry, Math.sqrt(Iy / A));
  check('rect Zx_top', r.Zx_top, Ix / 150);
  check('rect Zy_right', r.Zy_right, Iy / 100);
  check('rect α≈0', r.principalAngle, 0, 1e-9, 1e-9);
  check('rect Iu=Imax=Ix', r.Iu, Ix);
  check('rect Iv=Imin=Iy', r.Iv, Iy);
  check('rect iu', r.iu, Math.sqrt(Ix / A));
  check('rect iv', r.iv, Math.sqrt(Iy / A));
  check('rect Wu+ = Iu/vMax', r.WuP, Ix / 150);      // b·h²/6 = 3e6
  check('rect Wu−', r.WuM, Ix / 150);
  check('rect Wv+', r.WvP, Iy / 100);
  check('rect Wv−', r.WvM, Iy / 100);
  check('rect Wpl,u = b·h²/4', r.Wplu, 200 * 300 ** 2 / 4, 2e-4);  // 4.5e6
  check('rect Wpl,v', r.Wplv, 300 * 200 ** 2 / 4, 2e-4);           // 3.0e6
  check('rect au+', r.auP, 100);
  check('rect au−', r.auM, 100);
  check('rect av+', r.avP, 150);
  check('rect av−', r.avM, 150);
  check('rect yP=0', r.yP, 0, 1e-6, 1e-6);
  check('rect zP=0', r.zP, 0, 1e-6, 1e-6);
  check('rect uP=0', r.uP, 0, 1e-6, 1e-6);
  check('rect vP=0', r.vP, 0, 1e-6, 1e-6);
  checkTrue('rect Wpl≥W elastic', r.Wplu > r.WuP && r.Wplv > r.WvP);
  // Torsion: series formula vs table β(a/b=1.5)=0.1961: J=β·a·b³
  const Jexact = 0.1961 * 300 * 200 ** 3;
  const Jcalc = computeComponentTorsion(mkComp({ width: 200, height: 300 }));
  check('rect It (~4.7e8)', Jcalc, Jexact, 0.01);
}

// ─── Test 2: Symmetric I-section → Iyz≈0, α≈0 ─────────────────────────────
{
  const g = { flangeWidth: 200, flangeThickness: 15, webHeight: 270, webThickness: 10, bottomFlangeWidth: 200, bottomFlangeThickness: 15 };
  const r = computeSectionProperties([mkComp(g, 'i-section')]).props;
  checkTrue('I-section Iyz≈0', Math.abs(r.Ixy) < 1e-6 * Math.max(r.Ix, r.Iy), `Ixy=${r.Ixy}`);
  checkTrue('I-section α≈0', Math.abs(r.principalAngle) < 1e-9, `α=${r.principalAngle}`);
  // Compare to composite-rectangle hand calc
  const parts = [
    { w: 200, h: 15, cy: -142.5 },
    { w: 10, h: 270, cy: 0 },
    { w: 200, h: 15, cy: 142.5 },
  ];
  const A = parts.reduce((s, p) => s + p.w * p.h, 0);
  const Ix = parts.reduce((s, p) => s + p.w * p.h ** 3 / 12 + p.w * p.h * p.cy ** 2, 0);
  check('I-section area', r.area, A);
  check('I-section Ix', r.Ix, Ix, 1e-9);
  check('I-section centroidY', r.centroidY, 0, 1e-9);
  checkTrue('I-section Wpl≥W', r.Wplu > r.WuP);
  checkTrue('I-section It>0', r.It > 0, `It=${r.It}`);
}

// ─── Test 3: Asymmetric custom polygon (L-ish shape) ──────────────────────
// Right triangle (0,0) (100,0) (0,100) as custom shape
{
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
  const r = computeSectionProperties([mkComp({ points: pts }, 'custom-shape')]).props;
  check('tri A', r.area, 5000);
  check('tri centroidX', r.centroidX, 100 / 3);
  check('tri centroidY', r.centroidY, 100 / 3);
  const Ixc = 100 * 100 ** 3 / 36; // about centroidal axis parallel to a side
  // Ix about centroidal horizontal axis: b·h³/36 = 8.333e6/3... = 2.777e6
  check('tri Ix', r.Ix, Ixc, 1e-9);
  // yM/zM naming: distance to centroid along Y (horizontal) = centroidX
  check('tri yM==centroidX', r.centroidX, 100 / 3);
  checkTrue('tri Ixy≠0', Math.abs(r.Ixy) > 1);
  checkTrue('tri α nonzero', Math.abs(r.principalAngle) > 1);
  // Principal invariants
  check('tri Iu+Iv = Ix+Iy', r.Iu + r.Iv, r.Ix + r.Iy, 1e-9);
  check('tri Iu·Iv = Ix·Iy−Ixy²', r.Iu * r.Iv, r.Ix * r.Iy - r.Ixy ** 2, 1e-8);
  // Verify ∫v²dA == Iu using an independent numeric integration over the triangle
  let Iu_num = 0, Iv_num = 0;
  const N = 2000000;
  // deterministic stratified sampling inside the triangle
  const c = Math.cos(r.principalAngle * Math.PI / 180), s = Math.sin(r.principalAngle * Math.PI / 180);
  let count = 0;
  for (let i = 0; i < N; i++) {
    const u1 = ((i * 7919) % 100000) / 100000, u2 = ((i * 104729) % 100000) / 100000;
    let x = u1 * 100, y = u2 * 100;
    if (x + y > 100) { x = 100 - x; y = 100 - y; }
    const dx = x - r.centroidX, dy = y - r.centroidY;
    const v = -dx * s + dy * c, uu = dx * c + dy * s;
    Iu_num += v * v; Iv_num += uu * uu; count++;
  }
  Iu_num = Iu_num / count * 5000; Iv_num = Iv_num / count * 5000;
  check('tri Iu vs numeric ∫v²dA', Iu_num, r.Iu, 5e-3);
  check('tri Iv vs numeric ∫u²dA', Iv_num, r.Iv, 5e-3);
  checkTrue('tri Iu>Iv', r.Iu >= r.Iv);
  // Equal-area axis: triangle (0,0)(100,0)(0,100): vertical half-area line →
  // area left of x=k (k<50 region bounded by x+y<=100): A(k)=∫0..k (100−x)dx = 100k−k²/2 = 2500 → k≈25.64
  const yPabs = r.centroidX + r.yP;
  const kex = 100 - Math.sqrt(5000); // solve k²−200k+5000=0 → k = 100−√5000... check: 100·25.64−328=2500 ✓
  check('tri yP (abs)', yPabs, 100 - Math.sqrt(100 * 100 - 2 * 2500 + 0) , 1e-3);
  checkTrue('tri Wpl,u ≥ Wu+', r.Wplu >= r.WuP);
  checkTrue('tri Wpl,v ≥ Wv+', r.Wplv >= r.WvP);
  checkTrue('tri It>0', r.It > 0);
  // Wu± = Iu/av±
  check('tri Wu+ = Iu/vMax', r.WuP, r.Iu / r.avP, 1e-9);
  check('tri Wu− = Iu/avM', r.WuM, r.Iu / r.avM, 1e-9);
  check('tri Wv+ = Iv/auP', r.WvP, r.Iv / r.auP, 1e-9);
}

// ─── Test 4: Rotated rectangle — α must track rotation ────────────────────
{
  const comp = { ...mkComp({ width: 100, height: 400 }), rotation: 30, id: 'rot1' };
  const r = computeSectionProperties([comp]).props;
  // For a 1:4 rectangle, strong axis (Ix=1e... ) is about the long axis
  // Ix = 100·400³/12 = 5.33e8, Iy = 400·100³/12 = 3.33e7 → principal angle ≈ 30° from x-axis? 
  // U axis aligns with the long direction, which after +30° rotation points at 90+30=120° or its opposite; 
  // principal axes come out at ±90° from reported. Iu must equal 5.333e8.
  check('rot-rect Iu', r.Iu, 100 * 400 ** 3 / 12, 1e-6);
  check('rot-rect Iv', r.Iv, 400 * 100 ** 3 / 12, 1e-6);
  checkTrue('rot-rect α ≈ 30 or 120', Math.abs(Math.abs(r.principalAngle) - 30) < 1e-6 || Math.abs(Math.abs(r.principalAngle) - 120) < 1e-6, `α=${r.principalAngle}`);
  // Wu·(2·av) sanity: Wpl,u ≤ 2·avM·A/2... skip; consistency:
  check('rot-rect Wu+·avP', r.WuP * r.avP, r.Iu, 1e-9);
  checkTrue('rot-rect Wpl≥W', r.Wplu >= r.WuP * 0.9999);
}

// ─── Test 5: Subtractive component (box with hole) ─────────────────────────
{
  const outer = computeSectionProperties([mkComp({ width: 200, height: 300 })]).props;
  const holed = computeSectionProperties([
    mkComp({ width: 200, height: 300 }),
    mkComp({ width: 100, height: 100 }, 'rectangle', 'subtract'),
  ]).props;
  check('holed A', holed.area, outer.area - 10000);
  check('holed centroid=0', holed.centroidX, 0, 1e-9);
  check('holed Ix', holed.Ix, outer.Ix - 100 * 100 ** 3 / 12, 1e-9);
  // Centered hole: I decreases, extreme fibre unchanged → Wu decreases slightly
  checkTrue('holed Wu+ < outer Wu+', holed.WuP < outer.WuP);
  // equal-area axes still centered
  check('holed yP=0', holed.yP, 0, 1e-6, 1e-6);
  check('holed zP=0', holed.zP, 0, 1e-6, 1e-6);
  checkTrue('holed Wpl>0', holed.Wplu > 0 && holed.Wplv > 0);
}

// ─── Test 6: Circle — exact torsion + approx property consistency ─────────
{
  const c = computeSectionProperties([mkComp({ radius: 100 }, 'circle')]).props;
  check('circle A', c.area, Math.PI * 1e4, 1e-9);
  check('circle Ix', c.Ix, Math.PI * 1e8 / 4, 1e-9);
  check('circle It exact', computeComponentTorsion(mkComp({ radius: 100 }, 'circle')), Math.PI * 1e8 / 2, 1e-9);
  checkTrue('circle Iu≈Iv', Math.abs(c.Iu - c.Iv) / c.Iu < 0.002); // 48-gon outline for u/v extremes
  checkTrue('circle Wu+>0', c.WuP > 0);
}

// ─── Test 7: Angle (L) section — α sign sanity + principal transform ──────
{
  const r = computeSectionProperties([mkComp({ legWidth: 100, legHeight: 100, thickness: 10 }, 'l-section')]).props;
  // Equal legs → principal axes at ±45°
  checkTrue('L-section α≈±45', Math.abs(Math.abs(r.principalAngle) - 45) < 0.1, `α=${r.principalAngle}`);
  checkTrue('L-section Iyz≠0', Math.abs(r.Ixy) > 1e4);
  // Iyz must vanish in the principal frame: I_uv = 0 → check via transformation
  const t2 = 2 * r.principalAngle * Math.PI / 180;
  const Iuv = (r.Ix - r.Iy) / 2 * Math.sin(t2) + r.Ixy * Math.cos(t2);
  checkTrue('L-section Iuv≈0', Math.abs(Iuv) < 1e-3 * r.Iu, `Iuv=${Iuv}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
