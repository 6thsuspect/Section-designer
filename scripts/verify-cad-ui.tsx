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
    requestAnimationFrame: { value: (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) },
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
    document.body.textContent?.includes('Unknown command. HELP lists only implemented commands.'),
  );
  await submit('ZOOM');
  await submit('EXTENTS');
  const changedView = document.querySelector('svg.w-full.h-full')!.getAttribute('viewBox');
  assert.notEqual(changedView, originalView);
  await submit('RECTANGLE');
  await submit('2000,2000');
  await click(toggle());
  assert.equal(document.querySelector('[aria-label="CAD command window"]'), null);
  assert.equal(document.querySelector('svg.w-full.h-full')!.getAttribute('viewBox'), originalView);
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
  assert.ok(!document.querySelector('[role="log"]')?.textContent?.includes('position=2000,2000'));
  const collapse = document.querySelector(
    '[aria-label="Collapse command window"]',
  ) as HTMLButtonElement;
  await click(collapse);
  assert.equal(document.getElementById('cad-command-input'), null);
  await click(document.querySelector('[aria-label="Expand command window"]') as HTMLButtonElement);
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
      new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
    ),
  );
  assert.equal(parseFloat(panel.style.height), previousHeight + 20);
  await act(async () =>
    window.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }),
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
      new dom.window.KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }),
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
      new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 500, clientY: 350 }),
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
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  );
  assert.equal(input().value, '');
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
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
      new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    ),
  );
  const firstCompletion = input().value;
  await act(async () =>
    input().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    ),
  );
  assert.notEqual(input().value, firstCompletion);
  const typeDraft = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(
        input(),
        value,
      );
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
  const countDimensions = () => document.querySelectorAll('[data-testid="cad-dimension"]').length;
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
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('STRETCH completed.'));
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
      new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 500, clientY: 300 }),
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
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('CIRCLE2P completed.'));
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
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('CHAMFER completed.'));
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
  assert.ok(document.querySelector('[role="log"]')?.textContent?.includes('EXPLODE completed.'));
  await submit('ZOOM');
  await submit('RESET');
  await submit('L');
  await submit('0,0');
  await act(async () =>
    svg.dispatchEvent(
      new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 500, clientY: 400 }),
    ),
  );
  await submit('25');
  await submit('');
  assert.ok(
    svg.querySelector('polyline[points="0,0 25,0"]'),
    'direct distance follows the cursor direction',
  );
  await act(async () => root.unmount());
  console.log(
    'CAD UI checks passed: full app mode isolation, prompts, native drawing, draft paths, invalid input recovery, modifications, undo/redo, cancellation, extents, collapse and floating.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
