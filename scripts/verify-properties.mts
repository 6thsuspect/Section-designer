// Engineering verification of section properties against hand calculations.
// Run: node --experimental-strip-types scripts/verify-properties.mts
import { centerComponentsAtCG, computeSectionProperties, computeComponentTorsion } from '../src/engine/geometry.ts';
import { synchronizeBoltDeductions, withEdgeDistance, withEdge2Distance, withReference, withSpacing, withCount, deductionPatternIssues, resolveDeductionLayout } from '../src/engine/boltDeductions.ts';
import { findObjectSnap, componentSnapFeatures } from '../src/engine/osnap.ts';
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

// ─── Test 8: Dynamic CG frame — translation only, properties invariant ─────
{
  const a = mkComp({ width: 20, height: 10 });
  const b = mkComp({ width: 10, height: 10 });
  a.position = { x: 100, y: 200 };
  b.position = { x: 140, y: 180 };
  const original = [a, b];
  const before = computeSectionProperties(original).props;
  const centered = centerComponentsAtCG(original);
  const after = computeSectionProperties(centered).props;
  check('dynamic CG x=0', after.centroidX, 0, 1e-12, 1e-12);
  check('dynamic CG y=0', after.centroidY, 0, 1e-12, 1e-12);
  check('CG translation preserves area', after.area, before.area, 1e-12);
  check('CG translation preserves Ix', after.Ix, before.Ix, 1e-12);
  check('CG translation preserves Iy', after.Iy, before.Iy, 1e-12);
  check('CG translation preserves relative X',
    centered[1].position.x - centered[0].position.x,
    original[1].position.x - original[0].position.x,
    1e-12);
  check('CG translation preserves relative Y',
    centered[1].position.y - centered[0].position.y,
    original[1].position.y - original[0].position.y,
    1e-12);
}

// ─── Test 9: Vertical plate 20 t × 300 with rectangular bolt deductions ──
{
  const t = 20, L = 300, d = 22, n = 3, p = 80;
  const plate = mkComp({
    width: t,
    height: L,
    boltDeductions: { enabled: true, diameter: d, count: n, spacing: p, grouped: true },
  });
  const assembly = synchronizeBoltDeductions([plate]);
  const cuts = assembly.filter(c => c.associationKind === 'bolt-deduction');
  check('deduction count', cuts.length, n);
  checkTrue('deductions are subtract rectangles t × d', cuts.every(c =>
    c.type === 'rectangle' && c.operation === 'subtract' && c.parentId === plate.id && c.managedByParent
    && c.geometry.width === t && c.geometry.height === d));
  check('deduction spacing', cuts[1].position.y - cuts[0].position.y, p, 1e-12);
  const props = computeSectionProperties(assembly).props;
  check('net area = A − n·d·t', props.area, t * L - n * d * t, 1e-12);
  // Ix about plate centre: gross − Σ(own + parallel-axis) for each deduction.
  const ixNet = t * L ** 3 / 12 - n * (t * d ** 3 / 12) - 2 * t * d * p ** 2;
  check('net Ix with deductions', props.Ix, ixNet, 1e-9);
  check('symmetric deductions CG y', props.centroidY, 0, 1e-12, 1e-12);

  // Grouped deductions follow plate changes and keep stable IDs.
  const moved = { ...plate, position: { x: 50, y: 10 }, geometry: { ...plate.geometry, width: 25 } };
  const resync = synchronizeBoltDeductions([moved, ...cuts]).filter(c => c.associationKind === 'bolt-deduction');
  check('grouped deduction follows plate x', resync[0].position.x, 50, 1e-12);
  check('grouped deduction width follows thickness', resync[0].geometry.width ?? 0, 25, 1e-12);
  checkTrue('deduction IDs stable', resync.every((c, i) => c.id === cuts[i].id));

  // Horizontal plate: thickness is height, deductions spaced along x.
  const flange = mkComp({ width: 300, height: 15, boltDeductions: { enabled: true, diameter: 18, count: 2, spacing: 100, grouped: true } });
  const fc = synchronizeBoltDeductions([flange]).filter(c => c.associationKind === 'bolt-deduction');
  checkTrue('horizontal plate deduction is d × t', fc[0].geometry.width === 18 && fc[0].geometry.height === 15);
  check('horizontal plate spacing along x', fc[1].position.x - fc[0].position.x, 100, 1e-12);

  // Ungrouped: deductions become independent editable shapes.
  const ungroupedPlate = { ...plate, geometry: { ...plate.geometry, boltDeductions: { ...plate.geometry.boltDeductions!, grouped: false } } };
  const ung = synchronizeBoltDeductions([ungroupedPlate, ...cuts]);
  const free = ung.filter(c => c.associationKind === 'bolt-deduction');
  checkTrue('ungrouped deductions are separate unlocked shapes', free.length === n && free.every(c => !c.managedByParent && !c.locked));
  const edited = ung.map(c => c.id === free[0].id ? { ...c, position: { x: 0, y: 140 } } : c);
  const kept = synchronizeBoltDeductions(edited).find(c => c.id === free[0].id)!;
  check('ungrouped edit is preserved', kept.position.y, 140, 1e-12);
  const regrouped = synchronizeBoltDeductions(edited.map(c => c.id === plate.id ? plate : c)).find(c => c.id === free[0].id)!;
  check('regroup snaps back to pattern', regrouped.position.y, -p, 1e-12);
}

// ─── Test 10: Sequential edge distance + individual spacings ──────────────
{
  const t = 12, L = 400, d = 22;
  const cfg = { enabled: true, diameter: d, count: 4, spacing: 70, grouped: true, edgeDistance: 40, spacings: [70, 90, 110] };
  const plate = mkComp({ width: t, height: L, boltDeductions: cfg });
  const ys = (p: SectionComponent) => synchronizeBoltDeductions([p])
    .filter(c => c.associationKind === 'bolt-deduction').map(c => c.position.y + L / 2);
  const pos = ys(plate);
  check('hole 1 at edge distance', pos[0], 40, 1e-12);
  check('hole 2 = H1 + s1', pos[1], 110, 1e-12);
  check('hole 3 = H2 + s2', pos[2], 200, 1e-12);
  check('hole 4 = H3 + s3', pos[3], 310, 1e-12);

  // Chain: changing s1 shifts holes 2..4 by the delta.
  const chained = ys({ ...plate, geometry: { ...plate.geometry, boltDeductions: withSpacing(cfg, L, 0, 80, 'chain') } });
  check('chain: hole 2 moves', chained[1], 120, 1e-12);
  check('chain: hole 4 shifts', chained[3], 320, 1e-12);

  // Independent: only hole 2 moves; holes 1, 3, 4 stay put.
  const indep = ys({ ...plate, geometry: { ...plate.geometry, boltDeductions: withSpacing(cfg, L, 0, 80, 'independent') } });
  checkTrue('independent: only hole 2 moves', indep[0] === 40 && Math.abs(indep[1] - 120) < 1e-12 && Math.abs(indep[2] - 200) < 1e-12 && Math.abs(indep[3] - 310) < 1e-12);

  // Edge distance: chain shifts all, independent moves hole 1 only.
  const edgeChain = ys({ ...plate, geometry: { ...plate.geometry, boltDeductions: withEdgeDistance(cfg, L, 50, 'chain') } });
  check('edge chain: hole 4 shifts', edgeChain[3], 320, 1e-12);
  const edgeIndep = ys({ ...plate, geometry: { ...plate.geometry, boltDeductions: withEdgeDistance(cfg, L, 50, 'independent') } });
  checkTrue('edge independent: only hole 1 moves', edgeIndep[0] === 50 && Math.abs(edgeIndep[1] - 110) < 1e-12 && Math.abs(edgeIndep[3] - 310) < 1e-12);

  // Count: adding a hole appends at the last spacing; removing truncates.
  const five = withCount(cfg, L, 5);
  checkTrue('add hole appends last spacing', five.spacings!.length === 4 && five.spacings![3] === 110);
  checkTrue('remove hole keeps earlier spacings', JSON.stringify(withCount(cfg, L, 2).spacings) === '[70]');

  // Net Ix about plate centroid follows the actual hole positions.
  const props = computeSectionProperties(synchronizeBoltDeductions([plate])).props;
  check('irregular pattern net area', props.area, t * L - 4 * d * t, 1e-12);
  const holeYs = pos.map(y => y - L / 2);
  const A = t * L - 4 * d * t;
  const cy = (-d * t * holeYs.reduce((a, y) => a + y, 0)) / A;
  const IxRaw = t * L ** 3 / 12 - holeYs.reduce((a, y) => a + t * d ** 3 / 12 + t * d * y * y, 0);
  check('irregular pattern centroid', props.centroidY, cy, 1e-9, 1e-9);
  check('irregular pattern net Ix', props.Ix, IxRaw - A * cy * cy, 1e-9);

  // Fit checks
  const bad = mkComp({ width: t, height: L, boltDeductions: { ...cfg, edgeDistance: 5, spacings: [15, 90, 400] } });
  const issues = deductionPatternIssues(bad).map(i => i.message).join(' | ');
  checkTrue('fit: start edge, overlap, end edge flagged', /start edge/.test(issues) && /overlaps/.test(issues) && /end edge/.test(issues));
}

// ─── Test 11: Edge-1 → H1 → H2 → … → Edge-2 ───────────────────────────────
{
  const t = 10, L = 400, d = 22;
  const cfg = { enabled: true, diameter: d, count: 4, spacing: 70, grouped: true, edgeDistance: 40, spacings: [70, 90, 110] };
  const lay = resolveDeductionLayout(cfg, L);
  check('Edge-2 auto = L − Edge-1 − ΣH', lay.edge2Distance, 400 - 40 - 270, 1e-12);
  check('sequence sums to plate length', lay.edgeDistance + lay.spacings.reduce((a, b) => a + b, 0) + lay.edge2Distance, L, 1e-12);

  const pos = (c: typeof cfg, len = L) => synchronizeBoltDeductions([mkComp({ width: t, height: len, boltDeductions: c })])
    .filter(x => x.associationKind === 'bolt-deduction').map(x => x.position.y + len / 2);

  // Edge-2 edit, chain: group shifts, spacings retained, Edge-1 recalculated.
  const e2c = withEdge2Distance(cfg, L, 60, 'chain');
  const l2 = resolveDeductionLayout(e2c, L);
  checkTrue('Edge-2 chain keeps spacings', JSON.stringify(l2.spacings) === '[70,90,110]');
  check('Edge-2 chain recalculates Edge-1', l2.edgeDistance, 70, 1e-12);
  check('Edge-2 chain last hole', pos(e2c)[3], 340, 1e-12);

  // Edge-2 edit, independent: only last hole moves.
  const e2i = withEdge2Distance(cfg, L, 60, 'independent');
  const p2 = pos(e2i);
  checkTrue('Edge-2 independent moves last hole only', p2[0] === 40 && Math.abs(p2[2] - 200) < 1e-12 && Math.abs(p2[3] - 340) < 1e-12);

  // Plate length change: Edge-1 held → Edge-2 grows; Edge-2 held → holes follow end edge.
  check('Edge-1 held: Edge-2 grows with plate', resolveDeductionLayout(cfg, 500).edge2Distance, 190, 1e-12);
  const held2 = withReference(cfg, L, 'edge2');
  const lh = resolveDeductionLayout(held2, 500);
  check('Edge-2 held: Edge-2 unchanged', lh.edge2Distance, 90, 1e-12);
  check('Edge-2 held: Edge-1 recalculated', lh.edgeDistance, 140, 1e-12);
  check('Edge-2 held: last hole tracks end edge', pos(held2, 500)[3], 500 - 90, 1e-12);

  // Edge-2 held + chain spacing edit keeps Edge-2 and moves earlier holes.
  const hs = resolveDeductionLayout(withSpacing(held2, L, 2, 130, 'chain'), L);
  checkTrue('Edge-2 held spacing edit keeps Edge-2', Math.abs(hs.edge2Distance - 90) < 1e-12 && Math.abs(hs.edgeDistance - 20) < 1e-12);

  // Validation: overrun reported against Edge-2 with the excess length.
  const over = withSpacing(cfg, L, 2, 260, 'chain'); // Edge-2 = 400 − 40 − 420 = −60
  const msgs = deductionPatternIssues(mkComp({ width: t, height: L, boltDeductions: over })).map(i => i.message).join(' | ');
  checkTrue('overrun flagged on Edge-2 with excess', /Edge-2 is negative/.test(msgs) && /by 60/.test(msgs));
  const tight = withEdge2Distance(cfg, L, 5, 'independent');
  checkTrue('Edge-2 < radius flagged', deductionPatternIssues(mkComp({ width: t, height: L, boltDeductions: tight })).some(i => /Edge-2 \(5\) < hole radius/.test(i.message)));
  checkTrue('valid pattern has no issues', deductionPatternIssues(mkComp({ width: t, height: L, boltDeductions: cfg })).length === 0);
}

// ─── Test 12: Object snap (OSNAP) ─────────────────────────────────────────
{
  // A: 200 × 20 flange centred at origin (top face y = 10, corners x = ±100).
  const A = mkComp({ width: 200, height: 20 });
  // B: 20 × 100 web; corners at ±10, ±50 about its position.
  const B = mkComp({ width: 20, height: 100 });
  const comps = [A, B];
  const tol = 5;

  // Endpoint: B's bottom-left corner dragged near A's top-left corner (−100, 10).
  const end = findObjectSnap(B, { x: -90 + 1.5, y: 60 - 2 }, comps, { tolerance: tol });
  checkTrue('endpoint snap kind', end?.kind === 'endpoint');
  check('endpoint snap x', end!.position.x, -90, 1e-12);
  check('endpoint snap y', end!.position.y, 60, 1e-12);

  // Edge: B's bottom face near A's top face away from any feature point.
  const edge = findObjectSnap(B, { x: 37.3, y: 60 + 3 }, comps, { tolerance: tol });
  checkTrue('edge snap kind', edge?.kind === 'edge');
  check('edge snap seats web on flange (y)', edge!.position.y, 60, 1e-12);
  check('edge snap keeps sliding coordinate (x)', edge!.position.x, 37.3, 1e-12);

  // Midpoint: B's bottom-mid onto A's top-mid (0, 10).
  const mid = findObjectSnap(B, { x: 1, y: 61 }, comps, { tolerance: tol });
  checkTrue('midpoint snap', mid?.kind === 'midpoint' && Math.abs(mid.position.x) < 1e-12 && Math.abs(mid.position.y - 60) < 1e-12);

  // Free move outside the aperture.
  checkTrue('no snap outside aperture', findObjectSnap(B, { x: 37.3, y: 80 }, comps, { tolerance: tol }) === null);

  // Node: centre onto the origin when no object is nearby.
  const node = findObjectSnap(B, { x: 2, y: -1 }, [B], { tolerance: tol, nodes: [{ x: 0, y: 0 }] });
  checkTrue('node snap to origin', node?.kind === 'node' && Math.abs(node.position.x) < 1e-12 && Math.abs(node.position.y) < 1e-12);

  // Circle: quadrants offered instead of polygon vertices; centre-to-centre snap.
  const C = mkComp({ radius: 30 }, 'circle');
  const features = componentSnapFeatures(C);
  checkTrue('circle exposes 4 quadrants, no fake endpoints',
    features.points.filter(f => f.kind === 'quadrant').length === 4 && !features.points.some(f => f.kind === 'endpoint'));
  const D = { ...mkComp({ radius: 10 }, 'circle'), position: { x: 200, y: 200 } };
  const cc = findObjectSnap(D, { x: 1, y: 1 }, [C, D], { tolerance: tol });
  checkTrue('circle centre snap', cc?.kind === 'center' && Math.abs(cc.position.x) < 1e-12);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
