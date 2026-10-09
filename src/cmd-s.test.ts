import { test, type MockTimers } from "node:test";
import assert from "node:assert/strict";
import { interceptSave, isSaveShortcut, type KeyPress, type SaveMessage } from "./cmd-s.js";

function press(overrides: Partial<KeyPress> = {}): KeyPress {
  return { key: "s", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, ...overrides };
}

test("isSaveShortcut: ⌘S and Ctrl+S, nothing else", () => {
  assert.equal(isSaveShortcut(press()), true);
  assert.equal(isSaveShortcut(press({ metaKey: false, ctrlKey: true })), true);
  // Caps Lock uppercases the key without touching shiftKey.
  assert.equal(isSaveShortcut(press({ key: "S" })), true);

  assert.equal(isSaveShortcut(press({ metaKey: false })), false, "a bare s is typing");
  assert.equal(isSaveShortcut(press({ shiftKey: true, key: "S" })), false, "⌘⇧S is Save As");
  assert.equal(isSaveShortcut(press({ altKey: true })), false);
  assert.equal(isSaveShortcut(press({ key: "k" })), false);
});

/** A keydown as the browser would build it, minus the DOM. */
function keydown(overrides: Partial<KeyPress> & { repeat?: boolean; isComposing?: boolean } = {}) {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    key: "s",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    ...overrides,
  });
}

/** Let the save's promise chain settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("⌘S is swallowed and the save runs once", async () => {
  const target = new EventTarget();
  let saves = 0;
  interceptSave({ target, onSave: () => { saves++; } });

  const e = keydown();
  target.dispatchEvent(e);
  await settle();

  assert.equal(e.defaultPrevented, true);
  assert.equal(saves, 1);
});

test("with no onSave the dialog is still kept away", () => {
  const target = new EventTarget();
  interceptSave({ target });

  const e = keydown();
  target.dispatchEvent(e);
  assert.equal(e.defaultPrevented, true);
});

test("other keys are left alone", () => {
  const target = new EventTarget();
  let saves = 0;
  interceptSave({ target, onSave: () => { saves++; } });

  const plain = keydown({ metaKey: false });
  const other = keydown({ key: "k" });
  target.dispatchEvent(plain);
  target.dispatchEvent(other);

  assert.equal(plain.defaultPrevented, false);
  assert.equal(other.defaultPrevented, false);
  assert.equal(saves, 0);
});

test("a held key repeats: prevented every time, saved once", async () => {
  const target = new EventTarget();
  let saves = 0;
  interceptSave({ target, onSave: () => { saves++; } });

  target.dispatchEvent(keydown());
  const repeat = keydown({ repeat: true });
  target.dispatchEvent(repeat);
  await settle();

  assert.equal(repeat.defaultPrevented, true);
  assert.equal(saves, 1);
});

test("a press some component already claimed is not ours", async () => {
  const target = new EventTarget();
  let saves = 0;
  interceptSave({ target, onSave: () => { saves++; } });

  const e = keydown();
  e.preventDefault();
  target.dispatchEvent(e);
  await settle();

  assert.equal(saves, 0);
});

test("a keydown that is part of an IME composition is left alone", async () => {
  const target = new EventTarget();
  let saves = 0;
  interceptSave({ target, onSave: () => { saves++; } });

  // Mid-composition the keystroke belongs to the input method, not to us.
  const e = keydown({ isComposing: true });
  target.dispatchEvent(e);
  await settle();

  assert.equal(e.defaultPrevented, false);
  assert.equal(saves, 0);
});

test("while a save is in flight, a second ⌘S waits its turn", async () => {
  const target = new EventTarget();
  let saves = 0;
  let finish: () => void = () => {};
  interceptSave({
    target,
    onSave: () => {
      saves++;
      return new Promise<string>((resolve) => { finish = () => resolve("ok"); });
    },
  });

  target.dispatchEvent(keydown());
  target.dispatchEvent(keydown());
  assert.equal(saves, 1, "the second press is dropped, not queued");

  finish();
  await settle();
  target.dispatchEvent(keydown());
  assert.equal(saves, 2, "once it lands the shortcut works again");
});

test("a save that throws is reported, not raised, and does not jam the shortcut", async () => {
  const target = new EventTarget();
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    let calls = 0;
    interceptSave({
      target,
      onSave: () => {
        calls++;
        if (calls === 1) throw new Error("disk on fire");
        return Promise.reject(new Error("still on fire"));
      },
    });

    assert.doesNotThrow(() => target.dispatchEvent(keydown()));
    await settle();
    target.dispatchEvent(keydown());
    await settle();
    target.dispatchEvent(keydown());
    await settle();

    assert.equal(calls, 3);
    assert.equal(errors.length, 3);
  } finally {
    console.error = original;
  }
});

test("the returned function hands the shortcut back", () => {
  const target = new EventTarget();
  let saves = 0;
  const release = interceptSave({ target, onSave: () => { saves++; } });
  release();

  const e = keydown();
  target.dispatchEvent(e);
  assert.equal(e.defaultPrevented, false);
  assert.equal(saves, 0);
});

// ─── The toast ──────────────────────────────────────────────────────────────
//
// Under Node there is no `document`, so `showToast` returns before doing
// anything. These tests hand it a stand-in with only the calls cmd-s.ts makes:
// if the toast starts needing more of the DOM, they fail loudly instead of
// passing on a no-op. setTimeout is mocked, so the clock is the test's.

/** Just the parts of an element the toast reads and writes. */
class FakeElement {
  readonly tagName: string;
  className = "";
  textContent: string | null = "";
  readonly dataset: Record<string, string | undefined> = {};
  readonly attributes = new Map<string, string>();
  isConnected = false;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

class FakeParent {
  readonly children: FakeElement[] = [];

  appendChild(el: FakeElement): FakeElement {
    this.children.push(el);
    el.isConnected = true;
    return el;
  }
}

interface FakeDom {
  /** The toast elements on the page. */
  toasts(): FakeElement[];
  /** The stylesheets the toast injected. */
  styles(): FakeElement[];
  /** Take the fake away; whatever was on it counts as gone from the page. */
  remove(): void;
}

function installFakeDom(): FakeDom {
  const head = new FakeParent();
  const body = new FakeParent();
  const STYLE_SELECTOR = "style[data-cmd-s-toast]";
  const isToastStyle = (el: FakeElement) => el.tagName === "STYLE" && el.attributes.has("data-cmd-s-toast");

  const fakeDocument = {
    head,
    body,
    createElement: (tagName: string) => new FakeElement(tagName),
    querySelector(selector: string): FakeElement | null {
      if (selector !== STYLE_SELECTOR) throw new Error(`fake document: unsupported selector ${selector}`);
      return head.children.find(isToastStyle) ?? null;
    },
  };
  // Defined rather than assigned: the fakes are not a full Document, and need no cast this way.
  Object.defineProperty(globalThis, "document", { value: fakeDocument, configurable: true, writable: true });
  Object.defineProperty(globalThis, "getComputedStyle", {
    value: () => ({ opacity: "0" }),
    configurable: true,
    writable: true,
  });

  return {
    toasts: () => body.children.filter((el) => el.className === "cmd-s-toast"),
    styles: () => head.children.filter(isToastStyle),
    remove() {
      for (const el of [...head.children, ...body.children]) el.isConnected = false;
      Reflect.deleteProperty(globalThis, "document");
      Reflect.deleteProperty(globalThis, "getComputedStyle");
    },
  };
}

/**
 * A test with the fake DOM and a mocked clock. Afterwards every pending toast
 * timer is run out — two ticks, because the hide timer schedules the clear —
 * so none is left for the next test's toast to cancel.
 */
function toastTest(name: string, fn: (dom: FakeDom, clock: MockTimers) => Promise<void>): void {
  test(name, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const dom = installFakeDom();
    try {
      await fn(dom, t.mock.timers);
    } finally {
      t.mock.timers.tick(60_000);
      t.mock.timers.tick(60_000);
      dom.remove();
    }
  });
}

/** Let the save's promise chain settle; `settle` would wait on the mocked setTimeout. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The one toast on the page; fails if there is none or more than one. */
function onlyToast(dom: FakeDom): FakeElement {
  const toasts = dom.toasts();
  assert.equal(toasts.length, 1, "exactly one toast element");
  return toasts[0];
}

toastTest("a returned message is toasted at the position asked for, then hidden and cleared", async (dom, clock) => {
  const target = new EventTarget();
  interceptSave({ target, position: "top", onSave: () => "Saved" });

  target.dispatchEvent(keydown());
  await flush();

  const el = onlyToast(dom);
  assert.equal(el.textContent, "Saved");
  assert.equal(el.dataset.position, "top");
  assert.equal(el.dataset.shown, "true");
  assert.equal(el.getAttribute("role"), "status");
  assert.equal(el.getAttribute("aria-live"), "polite");
  assert.equal(dom.styles().length, 1, "the stylesheet is injected");

  // The default duration is 1800 ms; the text goes 200 ms later, once faded.
  clock.tick(1799);
  assert.equal(el.dataset.shown, "true");
  clock.tick(1);
  assert.equal(el.dataset.shown, "false");
  assert.equal(el.textContent, "Saved", "still there while it fades");
  clock.tick(199);
  assert.equal(el.textContent, "Saved");
  clock.tick(1);
  assert.equal(el.textContent, "");
});

toastTest("an empty or missing message shows no toast", async (dom) => {
  const target = new EventTarget();
  const results: Array<() => SaveMessage | Promise<SaveMessage>> = [
    () => "",
    () => undefined,
    () => null,
    () => Promise.resolve(""),
    () => Promise.resolve(undefined),
  ];
  let calls = 0;
  interceptSave({ target, onSave: () => results[calls++]() });

  for (let i = 0; i < results.length; i++) {
    target.dispatchEvent(keydown());
    await flush();
  }

  assert.equal(calls, results.length, "every press reached onSave");
  assert.equal(dom.toasts().length, 0);
  assert.equal(dom.styles().length, 0);
});

toastTest("a second save replaces the text and restarts the clock", async (dom, clock) => {
  const target = new EventTarget();
  const messages = ["Saved", "Saved again"];
  interceptSave({ target, duration: 1000, onSave: () => messages.shift() });

  target.dispatchEvent(keydown());
  await flush();
  const el = onlyToast(dom);
  assert.equal(el.textContent, "Saved");

  clock.tick(600);
  target.dispatchEvent(keydown());
  await flush();
  assert.equal(onlyToast(dom), el, "the same element, not a second toast");
  assert.equal(el.textContent, "Saved again");

  // The first save's clock would have hidden it at 1000; the second's runs to 1600.
  clock.tick(999);
  assert.equal(el.dataset.shown, "true");
  clock.tick(1);
  assert.equal(el.dataset.shown, "false");
  clock.tick(199);
  assert.equal(el.textContent, "Saved again");
  clock.tick(1);
  assert.equal(el.textContent, "", "cleared at duration + 200 ms");
});

toastTest("a save while the last toast fades out keeps its own text", async (dom, clock) => {
  const target = new EventTarget();
  const messages = ["Saved", "Saved again"];
  interceptSave({ target, duration: 1000, onSave: () => messages.shift() });

  target.dispatchEvent(keydown());
  await flush();
  const el = onlyToast(dom);
  clock.tick(1000);
  assert.equal(el.dataset.shown, "false", "fading out; its text clears at 1200");

  clock.tick(100);
  target.dispatchEvent(keydown());
  await flush();
  clock.tick(100);
  assert.equal(el.dataset.shown, "true");
  assert.equal(el.textContent, "Saved again", "the first toast's clear was cancelled");
});
