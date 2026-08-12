import type { SectionComponent, QAMessage } from './types';

export function validateComponents(components: SectionComponent[]): QAMessage[] {
  const messages: QAMessage[] = [];

  for (const comp of components) {
    const g = comp.geometry;

    // Zero/negative dimension checks
    if (comp.type === 'rectangle' || comp.type === 'box' || comp.type === 'hollow-rectangle') {
      if ((g.width ?? 0) <= 0) messages.push({ level: 'error', category: 'geometry', message: `${comp.name}: Width must be positive.`, componentId: comp.id });
      if ((g.height ?? 0) <= 0) messages.push({ level: 'error', category: 'geometry', message: `${comp.name}: Height must be positive.`, componentId: comp.id });
    }

    if (comp.type === 'circle') {
      if ((g.radius ?? 0) <= 0) messages.push({ level: 'error', category: 'geometry', message: `${comp.name}: Radius must be positive.`, componentId: comp.id });
    }

    if (comp.type === 'hollow-circle') {
      if ((g.outerRadius ?? 0) <= 0) messages.push({ level: 'error', category: 'geometry', message: `${comp.name}: Outer radius must be positive.`, componentId: comp.id });
      if ((g.innerRadius ?? 0) >= (g.outerRadius ?? 0)) messages.push({ level: 'error', category: 'geometry', message: `${comp.name}: Inner radius must be less than outer radius.`, componentId: comp.id });
    }

    if (comp.type === 'i-section' || comp.type === 't-section' || comp.type === 'channel') {
      if ((g.webThickness ?? 0) <= 0) messages.push({ level: 'error', category: 'geometry', message: `${comp.name}: Web thickness must be positive.`, componentId: comp.id });
      if ((g.flangeThickness ?? 0) <= 0) messages.push({ level: 'error', category: 'geometry', message: `${comp.name}: Flange thickness must be positive.`, componentId: comp.id });
    }

    if (comp.type === 'box') {
      if ((g.wallThickness ?? 0) >= Math.min(g.width ?? 0, g.height ?? 0) / 2) {
        messages.push({ level: 'error', category: 'geometry', message: `${comp.name}: Wall thickness too large.`, componentId: comp.id });
      }
    }

    if (comp.type === 'polygon' || comp.type === 'custom-shape') {
      if ((g.points ?? []).length < 3) {
        messages.push({ level: 'error', category: 'geometry', message: `${comp.name}: Custom/polygon shape needs at least 3 points.`, componentId: comp.id });
      }
    }

    // Engineering warnings
    if (comp.type === 'rectangle') {
      const ratio = (g.width ?? 1) / (g.height ?? 1);
      if (ratio > 100 || ratio < 0.01) {
        messages.push({ level: 'warning', category: 'engineering', message: `${comp.name}: Aspect ratio is extreme (${ratio.toFixed(1)}).`, componentId: comp.id });
      }
    }
  }

  // No visible add components
  const addComps = components.filter(c => c.visible && c.operation === 'add');
  if (components.length > 0 && addComps.length === 0) {
    messages.push({ level: 'warning', category: 'geometry', message: 'No positive (add) components found. Net area may be zero.' });
  }

  return messages;
}
