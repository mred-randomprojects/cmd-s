import { test } from "node:test";
import assert from "node:assert/strict";
import { interceptSave, isSaveShortcut, type KeyPress } from "./cmd-s.js";

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
