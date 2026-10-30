import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
async function main() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
  });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true },
    HTMLElement: { value: dom.window.HTMLElement },
    Element: { value: dom.window.Element },
    SVGElement: { value: dom.window.SVGElement },
    localStorage: { value: dom.window.localStorage },
    IS_REACT_ACT_ENVIRONMENT: { value: true, writable: true },
    ResizeObserver: {
      value: class {
        observe() {}
        disconnect() {}
      },
    },
    requestAnimationFrame: {
      value: (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0),
    },
    cancelAnimationFrame: { value: (id: number) => clearTimeout(id) },
  });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  const { createRoot } = await import('react-dom/client');
  const Page = (await import('../src/app/page')).default;
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Page />));
  const buttons = () => Array.from(document.querySelectorAll('button'));
  const click = async (button: HTMLElement) => {
    await act(async () => {
      button.click();
    });
  };
  const toggle = () => buttons().find((b) => b.textContent?.includes('AutoCAD Mode'))!;
  assert.ok(toggle());
  assert.equal(toggle().getAttribute('aria-pressed'), 'false');
  assert.equal(document.querySelector('[aria-label="CAD command window"]'), null);
  const originalSvg = document.querySelector('svg.w-full.h-full')!;
  const originalView = originalSvg.getAttribute('viewBox');
  await click(toggle());
  assert.equal(toggle().getAttribute('aria-pressed'), 'true');
  assert.ok(document.querySelector('[aria-label="CAD command window"]'));
  const input = () => document.getElementById('cad-command-input') as HTMLInputElement;
  const submit = async (value: string) => {
    await act(async () => {
      const element = input();
      const setter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(async () => {
      input()
        .closest('form')!
        .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
  };
  await submit('REC');
  assert.ok(document.body.textContent?.includes('Specify first corner:'));
  await submit('0,0');
  assert.ok(document.body.textContent?.includes('Specify opposite corner:'));
  await submit('100,50');
  assert.ok(document.body.textContent?.includes('RECTANGLE completed.'));
  await submit('SELECT');
  await submit('ALL');
  await submit('LIST');
  assert.ok(document.body.textContent?.includes('area=5000.000000'));
  await submit('UNDO');
  await submit('SELECT');
  await submit('ALL');
  await submit('LIST');
  assert.ok(document.body.textContent?.includes('Select objects first.'));
  await submit('REDO');
  await submit('SELECT');
  await submit('ALL');
  await submit('MOVE');
  await submit('0,0');
  await submit('@200,100');
  await submit('LIST');
  assert.ok(document.body.textContent?.includes('position=250,125'));
  await submit('CIRCLE');
  await submit('50,50');
  await submit('-1');
  assert.ok(document.body.textContent?.includes('Value must be greater than zero.'));
  await submit('25');
  assert.ok(document.body.textContent?.includes('CIRCLE completed.'));
  await submit('LINE');
  await submit('0,0');
  await submit('@100<45');
  await submit('');
  assert.ok(document.body.textContent?.includes('LINE completed.'));
  await submit('PL');
  await submit('0,0');
  await submit('10,0');
  await submit('10,10');
  await submit('Close');
  assert.ok(document.body.textContent?.includes('PLINE completed.'));
  await submit('ARC');
  await submit('1,0');
  await submit('0,1');
  await submit('-1,0');
  assert.ok(document.body.textContent?.includes('ARC completed.'));
  await submit('POL');
  await submit('6');
  await submit('0,0');
  await submit('20');
  assert.ok(document.body.textContent?.includes('POLYGON completed.'));
  await submit('HATCH');
  assert.ok(
    document.body.textContent?.includes(
      'Unknown command. HELP lists only implemented commands.',
    ),
  );
  await submit('ZOOM');
  await submit('EXTENTS');
  const changedView = document.querySelector('svg.w-full.h-full')!.getAttribute('viewBox');
  assert.notEqual(changedView, originalView);
  await submit('RECTANGLE');
  await submit('2000,2000');
  await click(toggle());
  assert.equal(document.querySelector('[aria-label="CAD command window"]'), null);
  assert.equal(
    document.querySelector('svg.w-full.h-full')!.getAttribute('viewBox'),
    originalView,
  );
  assert.equal(document.querySelector('[data-cad-ui]'), null);
  // CAD-only function keys must not change view/layout while mode is off.
  await act(async () => {
    window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F8', bubbles: true }));
  });
  await click(toggle());
  assert.ok(!document.querySelector('header')?.textContent?.includes('RECTANGLE'));
  await submit('SELECT');
  await submit('ALL');
  await submit('LIST');
  assert.ok(
    !document.querySelector('[role="log"]')?.textContent?.includes('position=2000,2000'),
  );
  const collapse = document.querySelector(
    '[aria-label="Collapse command window"]',
  ) as HTMLButtonElement;
  await click(collapse);
  assert.equal(document.getElementById('cad-command-input'), null);
  await click(
    document.querySelector('[aria-label="Expand command window"]') as HTMLButtonElement,
  );
  assert.ok(input());
  await click(buttons().find((b) => b.textContent === 'Float')!);
  assert.ok(
    document.querySelector('[aria-label="CAD command window"]')?.classList.contains('fixed'),
  );
  await click(buttons().find((b) => b.textContent === 'Dock')!);
  assert.ok(
    !document.querySelector('[aria-label="CAD command window"]')?.classList.contains('fixed'),
  );
  // Resizing and precision shortcuts.
  const separator = document.querySelector('[aria-label="Resize command window"]')!;
  const panel = document.querySelector('[aria-label="CAD command window"]') as HTMLElement;
  const previousHeight = parseFloat(panel.style.height);
  await act(async () =>
    separator.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true,
      }),
    ),
  );
  assert.equal(parseFloat(panel.style.height), previousHeight + 20);
  await act(async () =>
    window.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'F8',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(
    buttons()
      .find((b) => b.textContent === 'ORTHO')!
      .getAttribute('aria-pressed'),
    'true',
  );
  await act(async () =>
    window.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'F8',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  // Mouse point entry and preview use the real canvas coordinate transform.
  await submit('ZOOM');
  await submit('RESET');
  const svg = document.querySelector('svg.w-full.h-full') as unknown as SVGSVGElement;
  svg.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 800,
    bottom: 800,
    width: 800,
    height: 800,
    toJSON() {},
  });
  await submit('RECTANGLE');
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 400,
        clientY: 400,
        button: 0,
      }),
    ),
  );
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointermove', {
        bubbles: true,
        clientX: 500,
        clientY: 350,
      }),
    ),
  );
  assert.ok(svg.querySelector('polyline[stroke-dasharray]'), 'mouse preview should render');
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 500,
        clientY: 350,
        button: 0,
      }),
    ),
  );
  await submit('CIRCLE');
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 600,
        clientY: 600,
        button: 0,
      }),
    ),
  );
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 625,
        clientY: 600,
        button: 0,
      }),
    ),
  );
  assert.equal(document.querySelector('header')?.textContent?.includes('CIRCLE'), false);
  await submit('SELECT');
  await submit('WINDOW');
  await submit('-1,-1');
  await submit('101,51');
  await submit('LIST');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('position=50,25'));
  await submit('LINE');
  await submit('0,0');
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(input().value, '');
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(input().value, '0,0');
  // Tab cycles the original candidate set, not only the first completion.
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(input(), 'R');
    input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  const firstCompletion = input().value;
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.notEqual(input().value, firstCompletion);
  const typeDraft = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value',
      )!.set!.call(input(), value);
      input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const space = async (value: string) => {
    await typeDraft(value);
    await act(async () =>
      input().dispatchEvent(
        new dom.window.KeyboardEvent('keydown', {
          key: ' ',
          code: 'Space',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  };
  await typeDraft('di');
  assert.ok(document.querySelector('[role="listbox"]'));
  assert.ok(
    Array.from(document.querySelectorAll('[role="option"]')).some((e) =>
      e.textContent?.includes('DIMALIGNED'),
    ),
  );
  await click(
    Array.from(document.querySelectorAll('[role="option"]')).find((e) =>
      e.textContent?.startsWith('DIM ('),
    ) as HTMLElement,
  );
  assert.ok(document.querySelector('header')?.textContent?.includes('DIM'));
  const countDimensions = () =>
    document.querySelectorAll('[data-testid="cad-dimension"]').length;
  const beforeDims = countDimensions();
  await space('0,0');
  await space('30,40');
  await space('15,100');
  assert.equal(countDimensions(), beforeDims + 1);
  assert.ok(document.querySelector('[data-measurement="30"]'));
  await space('dal');
  await space('0,0');
  await space('30,40');
  await space('0,100');
  assert.equal(countDimensions(), beforeDims + 2);
  assert.ok(document.querySelector('[data-measurement="50"]'));
  await submit('UNDO');
  assert.equal(countDimensions(), beforeDims + 1);
  await submit('REDO');
  assert.equal(countDimensions(), beforeDims + 2);
  // Space also finishes a path, just like empty Enter.
  await space('l');
  await space('2000,2000');
  await space('2010,2000');
  await space('');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('LINE completed.'));
  await submit('REC');
  await submit('1000,1000');
  await submit('1100,1050');
  await typeDraft('st');
  assert.ok(document.querySelector('[role="option"]')?.textContent?.startsWith('STRETCH'));
  await space('st'); // incomplete command name accepts the first matching suggestion
  await space('1090,990');
  await space('1110,1060');
  await space('0,0');
  await space('50,0');
  assert.ok(
    document.querySelector('[role="log"]')?.textContent?.includes('STRETCH completed.'),
  );
  await submit('SELECT');
  await submit('WINDOW');
  await submit('999,999');
  await submit('1151,1051');
  await submit('LIST');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('area=7500.000000'));
  await submit('sc');
  await submit('1000,1000');
  await submit('2');
  await submit('LIST');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('area=30000.00000'));
  await submit('DIM');
  await submit('0,0');
  await submit('10,0');
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointermove', {
        bubbles: true,
        clientX: 500,
        clientY: 300,
      }),
    ),
  );
  assert.equal(countDimensions(), beforeDims + 3, 'dimension preview should appear');
  await submit('CANCEL');
  assert.equal(countDimensions(), beforeDims + 2);
  await typeDraft('sc');
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(
    document
      .querySelector('[role="option"][aria-selected="true"]')
      ?.textContent?.startsWith('SCALE'),
    true,
  );
  await space('sc');
  await submit('CANCEL');
  // Native CADCraft-style command sessions use the same canvas and history.
  await submit('ID');
  await submit('#10,20');
  await submit('');
  assert.ok(
    document.querySelector('header')?.textContent?.includes('ID'),
    'blank Enter should repeat last command',
  );
  await submit('CANCEL');
  await submit('C');
  await submit('2P');
  await submit('6000,6000');
  await submit('6020,6000');
  assert.ok(
    document.querySelector('[role="log"]')?.textContent?.includes('CIRCLE2P completed.'),
  );
  await submit('DO');
  await submit('10');
  await submit('20');
  await submit('7000,7000');
  await submit('SPL');
  await submit('8000,8000');
  await submit('8010,8010');
  await submit('8020,8000');
  await submit('');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('SPLINE completed.'));
  await submit('TEXT');
  await submit('100,100');
  await submit('10');
  await submit('0');
  await typeDraft('"Annotation');
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.ok(
    document.querySelector('header')?.textContent?.includes('TEXT'),
    'space within quoted content must remain text editing',
  );
  await submit('"Annotation text"');
  assert.ok(svg.textContent?.includes('Annotation text'));
  await submit('XL');
  await submit('30000,30000');
  await submit('30001,30001');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('XLINE completed.'));
  await submit('L');
  await submit('5000,5000');
  await submit('5100,5000');
  await submit('');
  await submit('SELECT');
  await submit('WINDOW');
  await submit('4999,4999');
  await submit('5101,5001');
  await submit('O');
  await submit('10');
  await submit('5000,5020');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('OFFSET completed.'));
  await submit('TR');
  await submit('5050,4900');
  await submit('5050,5100');
  await submit('5000,5000');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('TRIM completed.'));
  await submit('EX');
  await submit('5200,4900');
  await submit('5200,5100');
  await submit('5100,5000');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('EXTEND completed.'));
  await submit('BR');
  await submit('5070,5000');
  await submit('5130,5000');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('BREAK completed.'));
  await submit('L');
  await submit('10010,10000');
  await submit('10000,10000');
  await submit('');
  await submit('L');
  await submit('10000,10000');
  await submit('10000,10010');
  await submit('');
  await submit('SELECT');
  await submit('WINDOW');
  await submit('9999,9999');
  await submit('10011,10011');
  await submit('F');
  await submit('2');
  await submit('10010,10000');
  await submit('10000,10010');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('FILLET completed.'));
  await submit('UNDO');
  await submit('CHA');
  await submit('2');
  await submit('3');
  await submit('10010,10000');
  await submit('10000,10010');
  assert.ok(
    document.querySelector('[role="log"]')?.textContent?.includes('CHAMFER completed.'),
  );
  await submit('SELECT');
  await submit('WINDOW');
  await submit('9999,9999');
  await submit('10011,10011');
  await submit('J');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('JOIN completed.'));
  await submit('SELECT');
  await submit('WINDOW');
  await submit('9999,9999');
  await submit('10011,10011');
  await submit('X');
  assert.ok(
    document.querySelector('[role="log"]')?.textContent?.includes('EXPLODE completed.'),
  );
  await submit('ZOOM');
  await submit('RESET');
  await submit('L');
  await submit('0,0');
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointermove', {
        bubbles: true,
        clientX: 500,
        clientY: 400,
      }),
    ),
  );
  await submit('25');
  await submit('');
  assert.ok(
    svg.querySelector('polyline[points="0,0 25,0"]'),
    'direct distance follows the cursor direction',
  );
  // First-point acquisition must win over other snaps and ORTHO, without adding a duplicate vertex.
  await submit('ZOOM');
  await submit('RESET');
  await submit('POLYLINE');
  for (const point of ['0,0', '100,0', '100,100', '0,100']) await submit(point);
  await submit('U');
  assert.equal(
    svg.querySelector('[data-testid="cad-confirmed-path"]')?.getAttribute('points'),
    '0,0 100,0 100,100',
  );
  await submit('0,100');
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointermove', {
        bubbles: true,
        clientX: 401,
        clientY: 401,
      }),
    ),
  );
  assert.ok(
    svg.querySelector('[data-testid="cad-start-snap"]'),
    'initial endpoint snap marker',
  );
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointerdown', {
        bubbles: true,
        clientX: 401,
        clientY: 401,
        button: 0,
      }),
    ),
  );
  const closedSquare = () =>
    svg.querySelector('polyline[points="0,0 100,0 100,100 0,100 0,0"]');
  assert.ok(closedSquare(), 'mouse snaps and closes precisely at first vertex');
  await submit('UNDO');
  assert.equal(closedSquare(), null);
  await submit('REDO');
  assert.ok(closedSquare());
  await submit('SELECT');
  await submit('WINDOW');
  await submit('-1,-1');
  await submit('101,101');
  // More than one object can be in that region; use an isolated closed PLINE for following operations.
  await submit('PLINE');
  for (const point of ['40000,40000', '40100,40000', '40100,40100', '40000,40100'])
    await submit(point);
  await submit('C');
  const sourcePath = '40000,40000 40100,40000 40100,40100 40000,40100 40000,40000';
  assert.ok(svg.querySelector(`polyline[points="${sourcePath}"]`));
  await submit('S');
  await submit('CP');
  for (const point of ['40090,39990', '40110,39990', '40110,40110', '40090,40110'])
    await submit(point);
  await submit('');
  await submit('0,0');
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointermove', {
        bubbles: true,
        clientX: 450,
        clientY: 400,
      }),
    ),
  );
  assert.ok(svg.querySelector('[data-testid="cad-stretch-preview"]'));
  assert.ok(
    svg.querySelector(`polyline[points="${sourcePath}"]`),
    'source retained until confirmation',
  );
  await submit('@50,0');
  const stretchedPath = '40000,40000 40150,40000 40150,40100 40000,40100 40000,40000';
  assert.ok(
    svg.querySelector(`polyline[points="${stretchedPath}"]`),
    'only right-side vertices move',
  );
  assert.equal(svg.querySelector('[data-testid="cad-stretch-preview"]'), null);
  await submit('UNDO');
  assert.ok(svg.querySelector(`polyline[points="${sourcePath}"]`));
  await submit('REDO');
  assert.ok(svg.querySelector(`polyline[points="${stretchedPath}"]`));
  await submit('S');
  await submit('40090,39990');
  await submit('40160,40110');
  await submit('0,0');
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  assert.ok(
    svg.querySelector(`polyline[points="${stretchedPath}"]`),
    'cancelled STRETCH leaves geometry intact',
  );
  await submit('LINE');
  for (const point of ['41000,41000', '41100,41000', '41100,41100', '41000,41000'])
    await submit(point);
  const linePath = '41000,41000 41100,41000 41100,41100 41000,41000';
  assert.ok(
    svg.querySelector(`polyline[points="${linePath}"]`),
    'LINE coordinate entry auto-closes',
  );
  await submit('UNDO');
  assert.equal(svg.querySelector(`polyline[points="${linePath}"]`), null);
  await submit('REDO');
  assert.ok(svg.querySelector(`polyline[points="${linePath}"]`));
  await submit('L');
  await submit('42000,42000');
  await submit('@10,0');
  await submit('@0,10');
  await submit('U');
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  assert.ok(
    svg.querySelector('polyline[points="42000,42000 42010,42000"]'),
    'ESC retains confirmed LINE segments after active Undo',
  );
  await submit('SELECT');
  await submit('WINDOW');
  await submit('39999,39999');
  await submit('40151,40101');
  await submit('BOUNDARY');
  assert.ok(
    document.querySelector('[role="log"]')?.textContent?.includes('BOUNDARY completed.'),
    'closed flag supports engineering conversion: ' +
      document.querySelector('[role="log"]')?.textContent?.slice(-1500),
  );
  // ORTHO affects geometric placement, never selection acquisition.
  await submit('ZOOM');
  await submit('RESET');
  await submit('ORTHO');
  await submit('OFF');
  await act(async () =>
    window.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'F8',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  const orthoButton = () => buttons().find((b) => b.textContent === 'ORTHO')!;
  assert.equal(orthoButton().getAttribute('aria-pressed'), 'true');
  const pointer = async (type: string, x: number, y: number) => {
    await act(async () =>
      svg.dispatchEvent(
        new dom.window.MouseEvent(type, {
          bubbles: true,
          clientX: x,
          clientY: y,
          button: 0,
        }),
      ),
    );
  };
  const escapeCad = async () => {
    await act(async () =>
      input().dispatchEvent(
        new dom.window.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  };
  await submit('OSNAP');
  await submit('OFF');
  await submit('SNAP');
  await submit('OFF');
  await submit('LINE');
  await submit('0,0');
  await pointer('pointermove', 520, 330);
  assert.ok(
    svg.querySelector('polyline[points="0,0 120,0"]'),
    'F8 constrains drawing horizontally',
  );
  await pointer('pointermove', 470, 280);
  assert.ok(
    svg.querySelector('polyline[points="0,0 0,120"]'),
    'F8 constrains drawing vertically',
  );
  await escapeCad();
  await submit('RECTANGLE');
  await submit('-330,-330');
  await submit('-310,-310');
  await submit('RECTANGLE');
  await submit('-290,-330');
  await submit('-270,-310');
  // jsdom lacks the browser's pointer-capture methods used by drag selection.
  svg.setPointerCapture = () => {};
  svg.hasPointerCapture = () => false;
  for (const enabled of [true, false]) {
    await submit('ORTHO');
    await submit(enabled ? 'ON' : 'OFF');
    await pointer('pointerdown', 40, 740);
    await pointer('pointermove', 150, 690);
    assert.ok(
      svg.textContent?.includes('WINDOW · 110.0 × 50.0 · 2 objects'),
      'diagonal window has full width/height and multiple hits',
    );
    await pointer('pointerup', 150, 690);
    await submit('LIST');
    assert.ok(
      document.querySelector('[role="log"]')?.textContent?.includes('position=-320,-320'),
    );
    assert.ok(
      document.querySelector('[role="log"]')?.textContent?.includes('position=-280,-320'),
    );
    await pointer('pointerdown', 120, 725);
    await pointer('pointermove', 80, 715);
    assert.ok(
      svg.textContent?.includes('CROSSING · 40.0 × 10.0 · 2 objects'),
      'right-to-left selection crosses both rectangles without enclosing them',
    );
    await pointer('pointerup', 80, 715);
    assert.equal(orthoButton().getAttribute('aria-pressed'), String(enabled));
  }
  await submit('ORTHO');
  await submit('ON');
  // Selection can feed ordinary preselected modify commands without changing F8 state.
  await submit('MOVE');
  await submit('0,0');
  await submit('10,0');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.endsWith('MOVE completed.'));
  await submit('COPY');
  await submit('0,0');
  await submit('0,-20');
  assert.ok(document.querySelector('[role="log"]')?.textContent?.endsWith('COPY completed.'));
  assert.equal(orthoButton().getAttribute('aria-pressed'), 'true');
  await submit('OSNAP');
  await submit('ON');
  await submit('SNAP');
  await submit('ON');
  await submit('SELECT');
  await submit('WINDOW');
  await submit('-100,-100');
  await pointer('pointermove', 481.5, 413.25);
  assert.ok(
    svg.querySelector('polyline[points="-100,-100 81.5,-13.25"]'),
    'SELECT corners bypass drawing snaps and ORTHO',
  );
  await escapeCad();
  await submit('STRETCH');
  await submit('-100,-100');
  await pointer('pointermove', 481.5, 413.25);
  assert.equal(
    svg.querySelector('[data-testid="cad-stretch-area"]')?.getAttribute('points'),
    '-100,-100 81.5,-100 81.5,-13.25 -100,-13.25',
    'STRETCH window follows exact diagonal cursor',
  );
  await pointer('pointerdown', 481.5, 413.25);
  await pointer('pointermove', 520, 330);
  assert.ok(
    svg.textContent?.includes('120.000, 70.000'),
    'STRETCH base point is not constrained relative to a selection corner',
  );
  await submit('0,0');
  await pointer('pointermove', 520, 330);
  assert.ok(
    svg.textContent?.includes('120.000, 0.000'),
    'ORTHO resumes for STRETCH displacement',
  );
  await escapeCad();
  await submit('STRETCH');
  await submit('CP');
  await submit('-100,-100');
  await pointer('pointermove', 330, 450);
  assert.ok(
    svg.querySelector('polyline[points="-100,-100 -70,-50"]'),
    'crossing-polygon vertices are also unrestricted',
  );
  await escapeCad();
  assert.equal(
    orthoButton().getAttribute('aria-pressed'),
    'true',
    'selection never disables ORTHO globally',
  );
  await submit('OSNAP');
  await submit('OFF');
  await submit('SNAP');
  await submit('OFF');
  await submit('PLINE');
  await submit('0,0');
  await pointer('pointermove', 520, 330);
  assert.ok(
    svg.querySelector('polyline[points="0,0 120,0"]'),
    'drawing constraints resume immediately after selection',
  );
  await escapeCad();
  // The STRETCH mask survives confirmation; its temporary rectangle must not.
  await submit('OSNAP');
  await submit('OFF');
  await submit('SNAP');
  await submit('OFF');
  for (const orthoEnabled of [false, true]) {
    await submit('ORTHO');
    await submit(orthoEnabled ? 'ON' : 'OFF');
    for (const crossing of [false, true]) {
      await submit('STRETCH');
      const firstX = crossing ? 510 : 390;
      const secondX = crossing ? 390 : 510;
      await pointer('pointerdown', firstX, 410);
      await pointer('pointerup', firstX, 410);
      await pointer('pointermove', secondX, 290);
      assert.ok(
        svg.querySelector('[data-testid="cad-stretch-area"]'),
        'selection boundary is visible during acquisition',
      );
      await pointer('pointerdown', secondX, 290);
      await pointer('pointerup', secondX, 290);
      assert.equal(
        svg.querySelector('[data-testid="cad-stretch-area"]'),
        null,
        'confirmed rectangle disappears',
      );
      assert.ok(
        svg.querySelector('circle[fill="#22c55e"]'),
        'selected vertex highlighting is retained',
      );
      await pointer('pointermove', 420, 380);
      assert.equal(
        svg.querySelector('[data-testid="cad-stretch-area"]'),
        null,
        'base-point acquisition must not revive the rectangle',
      );
      await submit('0,0');
      await pointer('pointermove', 450, 400);
      assert.equal(
        svg.querySelector('[data-testid="cad-stretch-area"]'),
        null,
        'displacement preview must not revive the rectangle',
      );
      assert.ok(
        svg.querySelector('circle[fill="#22c55e"]'),
        'vertex mask survives displacement preview',
      );
      if (crossing) await escapeCad();
      else {
        await submit('@5,0');
        await submit('UNDO');
      }
      assert.equal(
        svg.querySelector('[data-testid="cad-stretch-area"]'),
        null,
        'completion/cancel clears temporary rectangle',
      );
      assert.equal(
        svg.querySelector('circle[fill="#22c55e"]'),
        null,
        'completion/cancel clears temporary vertex graphics',
      );
      await submit('LINE');
      await submit('0,0');
      await pointer('pointermove', 470, 370);
      assert.equal(
        svg.querySelector('[data-testid="cad-stretch-area"]'),
        null,
        'subsequent drawing has no stale selection rectangle',
      );
      await escapeCad();
    }
  }
  await submit('STRETCH');
  await submit('-10,-10');
  await pointer('pointermove', 510, 290);
  assert.ok(svg.querySelector('[data-testid="cad-stretch-area"]'));
  await escapeCad();
  assert.equal(
    svg.querySelector('[data-testid="cad-stretch-area"]'),
    null,
    'ESC during selection clears the live rectangle',
  );
  await submit('STRETCH');
  await submit('CP');
  for (const point of ['-10,-10', '110,-10', '110,110', '-10,110']) await submit(point);
  await submit('');
  assert.equal(
    svg.querySelector('[data-testid="cad-stretch-area"]'),
    null,
    'confirmed polygon boundary is temporary too',
  );
  assert.ok(svg.querySelector('circle[fill="#22c55e"]'), 'polygon selection mask is retained');
  await escapeCad();
  await act(async () => root.unmount());
  console.log(
    'CAD UI checks passed: full app mode isolation, prompts, native drawing, draft paths, invalid input recovery, modifications, undo/redo, cancellation, extents, collapse and floating.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
