import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { exportMidasMCT } from '../src/engine/midasMct';
import type { SectionProject } from '../src/engine/types';

async function main() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true },
    IS_REACT_ACT_ENVIRONMENT: { value: true, writable: true },
  });
  const { createRoot } = await import('react-dom/client');
  const ImportDialog = (await import('../src/components/ImportDialog')).default;
  let imported: SectionProject | undefined;
  let closed = 0;
  const root = createRoot(document.getElementById('root')!);
  await act(async () =>
    root.render(
      <ImportDialog
        onClose={() => closed++}
        onImport={(p) => {
          imported = p;
        }}
      />,
    ),
  );
  const button = () =>
    [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Import & Calculate'),
    )!;
  const upload = async (name: string, text: string | Promise<string>) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ name, text: () => Promise.resolve(text) }],
    });
    await act(async () =>
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true })),
    );
  };
  const select = async (selector: string, value: string) => {
    await act(async () => {
      const input = document.querySelector<HTMLSelectElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };
  assert.ok(document.querySelector('input')!.accept.includes('.mct'));
  assert.ok(button().disabled);
  const project: SectionProject = {
    id: 'test',
    name: 'First',
    description: '',
    sectionNumber: 5,
    units: 'cm',
    components: [
      {
        id: 'r',
        name: 'Plate',
        type: 'rectangle',
        geometry: { width: 10, height: 20 },
        position: { x: 0, y: 0 },
        rotation: 0,
        operation: 'add',
        materialId: '',
        visible: true,
        locked: false,
      },
    ],
    materials: [],
    revision: 1,
    createdAt: '',
    updatedAt: '',
  };
  const text = exportMidasMCT(project);
  const record = text.slice(text.indexOf('\r\n SECT=') + 2).replace('*ENDDATA', '');
  const multiple = `*UNIT\nN,CM,KJ,C\n*SECT-PSCVALUE\n${record}\n${record.replace('SECT=5', 'SECT=8').replace('First', 'Second')}\n${record.replace('SECT=5, VALUE', 'SECT=9, TAPERED')}\n*ENDDATA`;
  await upload('Section.mct', multiple);
  assert.equal(imported, undefined);
  assert.ok(!button().disabled);
  assert.equal(document.querySelectorAll('#mct-section option').length, 3);
  assert.ok(document.body.textContent!.includes('MIDAS geometry ready'));
  await select('#mct-section', '9');
  assert.ok(button().disabled);
  assert.ok(document.body.textContent!.includes('not supported'));
  await select('#mct-section', '8');
  assert.ok(!button().disabled);
  assert.ok(document.body.textContent!.includes('Second'));
  await select('[aria-label="MIDAS coordinate unit"]', 'ft');
  assert.ok(document.body.textContent!.includes('ft'));
  await act(async () => button().click());
  assert.equal(imported!.sectionNumber, 8);
  assert.equal(imported!.name, 'Second');
  assert.equal(imported!.units, 'ft');
  assert.equal(closed, 1);
  // Existing JSON import remains available alongside the new format.
  await upload('Existing.section.json', JSON.stringify(project));
  assert.ok(!button().disabled);
  assert.equal(document.querySelector('#mct-section'), null);
  // Drag/drop and case-insensitive extensions use the same validation path.
  await act(async () => {
    const drop = new dom.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [{ name: 'Dropped.MCT', text: async () => text }] },
    });
    document.querySelector('.border-dashed')!.dispatchEvent(drop);
  });
  assert.ok(!button().disabled);
  assert.ok(document.body.textContent!.includes('Dropped.MCT'));
  await upload('Invalid.mct', 'invalid');
  assert.ok(button().disabled);
  assert.equal(document.querySelector('#mct-section'), null);
  // File reads may finish out of order: stale geometry must never win.
  let finish!: (value: string) => void;
  await upload(
    'Old.mct',
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await upload('New.mct', text.replace('First', 'Newest'));
  await act(async () => finish(text));
  assert.ok(document.body.textContent!.includes('Newest'));
  assert.ok(!document.body.textContent!.includes('Old.mct'));
  await upload('Wrong.txt', text);
  assert.ok(button().disabled);
  assert.ok(document.body.textContent!.includes('Unsupported file type'));
  await act(async () => root.unmount());
  dom.window.close();
  console.log(
    'MIDAS import UI checks passed: file selection, preview, multi-section selection, units, confirmation, invalid files and asynchronous read safety.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
