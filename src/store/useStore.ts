'use client';
import { useState, useCallback, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import type { SectionComponent, SectionProject, SectionProperties, StressInput, CalcTrace, Material, LengthUnit, QAMessage } from '@/engine/types';
import { centerComponentsAtCG, computeSectionProperties, computeStress } from '@/engine/geometry';
import { synchronizeBoltDeductions } from '@/engine/boltDeductions';
import { combineComponents, deleteCombinedCutout, deleteCombinedVoid, synchronizeCombinedCutouts, uncombineComponent } from '@/engine/combine';
import { validateComponents } from '@/engine/qa';

const defaultMaterial: Material = {
  id: 'steel-default',
  name: 'Structural Steel',
  E: 200000,
  density: 7850,
  grade: 'Fe 410',
  color: '#60a5fa',
};

const concreteMaterial: Material = {
  id: 'concrete-default',
  name: 'Concrete',
  E: 30000,
  density: 2500,
  grade: 'M30',
  color: '#94a3b8',
};

function createDefaultProject(): SectionProject {
  return {
    id: uuid(),
    name: 'Untitled Section',
    description: '',
    units: 'mm' as LengthUnit,
    components: [],
    materials: [defaultMaterial, concreteMaterial],
    loads: { P: 0, Mx: 0, My: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 1,
    alignCGToOrigin: false,
  };
}

/** Synchronize associated geometry and optionally maintain CG at (0,0). */
function prepareProjectGeometry(project: SectionProject): SectionProject {
  const synchronized = synchronizeCombinedCutouts(synchronizeBoltDeductions(project.components));
  const components = project.alignCGToOrigin
    ? centerComponentsAtCG(synchronized)
    : synchronized;
  return components === project.components ? project : { ...project, components };
}

export interface StoreState {
  project: SectionProject;
  selectedComponentId: string | null;
  selectedIds: string[];
  /** Selected interior void of a combined section (for Delete Cutout). */
  selectedVoid: { combinedId: string; index: number } | null;
  selectVoid: (combinedId: string, index: number) => void;
  /** Delete a void (index) or subtractive cut-out (component id) of a combined section. */
  deleteCutout: (target: { combinedId: string; index: number } | { cutoutId: string }) => string | null;
  properties: SectionProperties | null;
  stressResult: { maxCompression: number; maxTension: number; stressAt: (x: number, y: number) => number; neutralAxisAngle: number; trace: CalcTrace } | null;
  calcTrace: CalcTrace | null;
  qaMessages: QAMessage[];
  undoStack: SectionProject[];
  redoStack: SectionProject[];

  // Actions
  setProject: (p: SectionProject) => void;
  addComponent: (type: SectionComponent['type']) => void;
  addCustomShape: (name: string, points: { x: number; y: number }[]) => string;
  updateComponent: (id: string, updates: Partial<SectionComponent>, opts?: { history?: boolean }) => void;
  deleteComponent: (id: string) => void;
  deleteComponents: (ids: string[]) => void;
  duplicateComponent: (id: string) => void;
  selectComponent: (id: string | null) => void;
  selectComponents: (ids: string[]) => void;
  pushUndoSnapshot: () => void;
  setLoads: (loads: StressInput) => void;
  setProjectMeta: (name: string, description: string) => void;
  setUnits: (u: LengthUnit) => void;
  toggleCGOrigin: () => void;
  /** Combine shapes into one closed section; returns an error message on failure. */
  combineShapes: (ids: string[]) => string | null;
  /** Restore a combined section's last uncombined state. */
  uncombineShape: (id: string) => string | null;
  undo: () => void;
  redo: () => void;
  recalculate: () => void;
  newProject: () => void;
}

export function useStore(): StoreState {
  const [project, setProjectState] = useState<SectionProject>(createDefaultProject);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedVoid, setSelectedVoid] = useState<{ combinedId: string; index: number } | null>(null);
  const [properties, setProperties] = useState<SectionProperties | null>(null);
  const [stressResult, setStressResult] = useState<StoreState['stressResult']>(null);
  const [calcTrace, setCalcTrace] = useState<CalcTrace | null>(null);
  const [qaMessages, setQaMessages] = useState<QAMessage[]>([]);
  const undoStackRef = useRef<SectionProject[]>([]);
  const redoStackRef = useRef<SectionProject[]>([]);
  const [, forceUpdate] = useState(0);

  const pushUndo = useCallback((p: SectionProject) => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), p];
    redoStackRef.current = [];
  }, []);

  const recalculate = useCallback((proj?: SectionProject) => {
    const source = proj ?? project;
    const p = prepareProjectGeometry(source);
    if (p !== source) setProjectState(p);
    const result = computeSectionProperties(p.components);
    setProperties(result.props);
    setCalcTrace(result.trace);
    if (p.loads && (p.loads.P !== 0 || p.loads.Mx !== 0 || p.loads.My !== 0)) {
      const sr = computeStress(result.props, p.loads);
      setStressResult(sr);
    } else {
      setStressResult(null);
    }
    setQaMessages(validateComponents(p.components));
  }, [project]);

  const setProject = useCallback((p: SectionProject) => {
    pushUndo(project);
    const centeredProject = prepareProjectGeometry(p);
    setProjectState(centeredProject);
    // Recalculate after moving the dynamic CG reference to (0,0).
    const result = computeSectionProperties(centeredProject.components);
    setProperties(result.props);
    setCalcTrace(result.trace);
    if (centeredProject.loads && (centeredProject.loads.P !== 0 || centeredProject.loads.Mx !== 0 || centeredProject.loads.My !== 0)) {
      const sr = computeStress(result.props, centeredProject.loads);
      setStressResult(sr);
    } else {
      setStressResult(null);
    }
    setQaMessages(validateComponents(centeredProject.components));
  }, [project, pushUndo]);

  const updateProjectAndRecalc = useCallback((updater: (p: SectionProject) => SectionProject, history = true) => {
    setProjectState(prev => {
      if (history) pushUndo(prev);
      const updated = updater(prev);
      const next = prepareProjectGeometry({ ...updated, updatedAt: new Date().toISOString() });
      // schedule recalculate
      setTimeout(() => {
        const result = computeSectionProperties(next.components);
        setProperties(result.props);
        setCalcTrace(result.trace);
        if (next.loads && (next.loads.P !== 0 || next.loads.Mx !== 0 || next.loads.My !== 0)) {
          const sr = computeStress(result.props, next.loads);
          setStressResult(sr);
        } else {
          setStressResult(null);
        }
        setQaMessages(validateComponents(next.components));
      }, 0);
      return next;
    });
  }, [pushUndo]);

  const addComponent = useCallback((type: SectionComponent['type']) => {
    const id = uuid();
    const defaults: Record<string, Partial<SectionComponent>> = {
      'rectangle': { geometry: { width: 200, height: 300 } },
      'circle': { geometry: { radius: 100 } },
      'hollow-circle': { geometry: { outerRadius: 100, innerRadius: 80 } },
      'triangle': { geometry: { vertices: [{ x: -100, y: -75 }, { x: 100, y: -75 }, { x: 0, y: 75 }] } },
      'polygon': { geometry: { points: [{ x: -100, y: -100 }, { x: 100, y: -100 }, { x: 150, y: 50 }, { x: 0, y: 150 }, { x: -150, y: 50 }] } },
      'i-section': { geometry: { flangeWidth: 200, flangeThickness: 15, webHeight: 270, webThickness: 10, bottomFlangeWidth: 200, bottomFlangeThickness: 15 } },
      't-section': { geometry: { flangeWidth: 200, flangeThickness: 15, webHeight: 285, webThickness: 10 } },
      'l-section': { geometry: { legWidth: 100, legHeight: 100, thickness: 10 } },
      'channel': { geometry: { flangeWidth: 75, flangeThickness: 11, webHeight: 278, webThickness: 8 } },
      'box': { geometry: { width: 200, height: 300, wallThickness: 10 } },
      'hollow-rectangle': { geometry: { width: 200, height: 300, innerWidth: 180, innerHeight: 280 } },
      'ellipse': { geometry: { majorAxis: 200, minorAxis: 120 } },
    };

    const def = defaults[type] ?? { geometry: { width: 100, height: 100 } };
    const comp: SectionComponent = {
      id,
      name: `${type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')} ${Date.now() % 1000}`,
      type,
      geometry: def.geometry ?? {},
      position: { x: 0, y: 0 },
      rotation: 0,
      operation: 'add',
      materialId: 'steel-default',
      visible: true,
      locked: false,
    };

    updateProjectAndRecalc(p => ({ ...p, components: [...p.components, comp] }));
    setSelectedComponentId(id);
    setSelectedIds([id]);
  }, [updateProjectAndRecalc]);

  const addCustomShape = useCallback((name: string, points: { x: number; y: number }[]) => {
    const id = uuid();
    const cleanPoints = points.map(p => ({ x: Number(p.x), y: Number(p.y) }));

    const comp: SectionComponent = {
      id,
      name: name.trim() || 'Custom Shape',
      type: 'custom-shape',
      geometry: { points: cleanPoints },
      position: { x: 0, y: 0 },
      rotation: 0,
      operation: 'add',
      materialId: 'steel-default',
      visible: true,
      locked: false,
    };

    updateProjectAndRecalc(p => ({ ...p, components: [...p.components, comp] }));
    setSelectedComponentId(id);
    setSelectedIds([id]);
    return id;
  }, [updateProjectAndRecalc]);

  const updateComponent = useCallback((id: string, updates: Partial<SectionComponent>, opts?: { history?: boolean }) => {
    updateProjectAndRecalc(p => ({
      ...p,
      components: p.components.map(c => c.id === id ? { ...c, ...updates } : c),
    }), opts?.history !== false);
  }, [updateProjectAndRecalc]);

  const deleteComponent = useCallback((id: string) => {
    updateProjectAndRecalc(p => ({
      ...p,
      components: p.components.filter(c => c.id !== id),
    }));
    setSelectedComponentId(prev => prev === id ? null : prev);
    setSelectedIds(prev => prev.filter(x => x !== id));
  }, [updateProjectAndRecalc]);

  // Multi-select delete: single undo step for the whole batch.
  const deleteComponents = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    updateProjectAndRecalc(p => ({
      ...p,
      components: p.components.filter(c => !idSet.has(c.id)),
    }));
    setSelectedComponentId(prev => prev !== null && idSet.has(prev) ? null : prev);
    setSelectedIds(prev => prev.filter(x => !idSet.has(x)));
  }, [updateProjectAndRecalc]);

  // Manual history point (e.g. before starting a canvas drag so that the
  // whole drag produces a single undo entry).
  const pushUndoSnapshot = useCallback(() => {
    pushUndo(project);
  }, [pushUndo, project]);

  const duplicateComponent = useCallback((id: string) => {
    updateProjectAndRecalc(p => {
      const original = p.components.find(c => c.id === id);
      if (!original) return p;
      const newComp: SectionComponent = {
        ...original,
        id: uuid(),
        name: `${original.name} (copy)`,
        position: { x: original.position.x + 20, y: original.position.y + 20 },
      };
      return { ...p, components: [...p.components, newComp] };
    });
  }, [updateProjectAndRecalc]);

  const setLoads = useCallback((loads: StressInput) => {
    updateProjectAndRecalc(p => ({ ...p, loads }));
  }, [updateProjectAndRecalc]);

  const setProjectMeta = useCallback((name: string, description: string) => {
    setProjectState(prev => ({ ...prev, name, description }));
  }, []);

  const setUnits = useCallback((units: LengthUnit) => {
    setProjectState(prev => ({ ...prev, units }));
  }, []);

  const combineShapes = useCallback((ids: string[]): string | null => {
    const outcome = combineComponents(project.components, ids, uuid());
    if (!outcome.ok) return outcome.error;
    updateProjectAndRecalc(p => ({ ...p, components: outcome.components }));
    setSelectedIds([outcome.combinedId]);
    setSelectedComponentId(outcome.combinedId);
    return null;
  }, [project.components, updateProjectAndRecalc]);

  const uncombineShape = useCallback((id: string): string | null => {
    const outcome = uncombineComponent(project.components, id);
    if (!outcome.ok) return outcome.error;
    updateProjectAndRecalc(p => ({ ...p, components: outcome.components }));
    setSelectedIds(outcome.restoredIds);
    setSelectedComponentId(outcome.restoredIds[outcome.restoredIds.length - 1] ?? null);
    return null;
  }, [project.components, updateProjectAndRecalc]);

  const selectVoid = useCallback((combinedId: string, index: number) => {
    setSelectedComponentId(combinedId);
    setSelectedIds([combinedId]);
    setSelectedVoid({ combinedId, index });
  }, []);

  const deleteCutout = useCallback((target: { combinedId: string; index: number } | { cutoutId: string }): string | null => {
    const outcome = 'cutoutId' in target
      ? deleteCombinedCutout(project.components, target.cutoutId)
      : deleteCombinedVoid(project.components, target.combinedId, target.index);
    if (!outcome.ok) return outcome.error;
    updateProjectAndRecalc(p => ({ ...p, components: outcome.components }));
    setSelectedVoid(null);
    if ('cutoutId' in target) {
      const parentId = project.components.find(c => c.id === target.cutoutId)?.parentId ?? null;
      setSelectedComponentId(parentId);
      setSelectedIds(parentId ? [parentId] : []);
    }
    return null;
  }, [project.components, updateProjectAndRecalc]);

  const toggleCGOrigin = useCallback(() => {
    updateProjectAndRecalc(project => ({
      ...project,
      alignCGToOrigin: !project.alignCGToOrigin,
    }));
  }, [updateProjectAndRecalc]);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    setProjectState(current => {
      redoStackRef.current = [...redoStackRef.current, current];
      return prev;
    });
    setTimeout(() => {
      const result = computeSectionProperties(prev.components);
      setProperties(result.props);
      setCalcTrace(result.trace);
      setQaMessages(validateComponents(prev.components));
    }, 0);
    forceUpdate(n => n + 1);
  }, []);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStackRef.current = stack.slice(0, -1);
    setProjectState(current => {
      undoStackRef.current = [...undoStackRef.current, current];
      return next;
    });
    setTimeout(() => {
      const result = computeSectionProperties(next.components);
      setProperties(result.props);
      setCalcTrace(result.trace);
      setQaMessages(validateComponents(next.components));
    }, 0);
    forceUpdate(n => n + 1);
  }, []);

  const newProject = useCallback(() => {
    const p = createDefaultProject();
    setProjectState(p);
    setSelectedComponentId(null);
    setSelectedIds([]);
    setProperties(null);
    setCalcTrace(null);
    setStressResult(null);
    setQaMessages([]);
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  return {
    project,
    selectedComponentId,
    selectedIds,
    selectedVoid,
    selectVoid,
    deleteCutout,
    properties,
    stressResult,
    calcTrace,
    qaMessages,
    undoStack: undoStackRef.current,
    redoStack: redoStackRef.current,
    setProject,
    addComponent,
    addCustomShape,
    updateComponent,
    deleteComponent,
    deleteComponents,
    duplicateComponent,
    selectComponent: (id: string | null) => {
      setSelectedVoid(null);
      setSelectedComponentId(id);
      setSelectedIds(id !== null ? [id] : []);
    },
    selectComponents: (ids: string[]) => {
      setSelectedVoid(null);
      setSelectedIds(ids);
      setSelectedComponentId(ids.length > 0 ? ids[ids.length - 1] : null);
    },
    pushUndoSnapshot,
    setLoads,
    setProjectMeta,
    setUnits,
    toggleCGOrigin,
    combineShapes,
    uncombineShape,
    undo,
    redo,
    recalculate,
    newProject,
  };
}
