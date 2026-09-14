/**
 * ⌘S / Ctrl+S, pointed at the app instead of the browser.
 *
 * Every one of these apps saves itself — to localStorage, to Firestore, to a
 * file on disk — and none of them has a Save button. Hands remember ⌘S anyway,
 * and in a browser that opens the "Save page as…" dialog, which is the wrong
 * answer to a question the app could answer.
 *
 * `interceptSave` swallows the shortcut and, if asked, runs the app's own save
 * and shows the words the app hands back in a small toast. Nothing else: no
 * dependencies, no framework, no theme to match — a dark pill at the edge of
 * the screen that reads fine over any of the sites it lives on.
 *
 * Two ways in:
 *
 *   // Vite / npm — "cmd-s": "github:mred-randomprojects/cmd-s#v1.0.0"
 *   import { interceptSave } from "cmd-s";
 *   interceptSave({ onSave: () => { flush(); return "Saved"; } });
 *
 *   // A single HTML file
 *   <script type="module">
 *     import { interceptSave } from "https://cdn.jsdelivr.net/gh/mred-randomprojects/cmd-s@1.0.0/dist/cmd-s.js";
 *     interceptSave({ onSave: () => "Guardado" });
 *   </script>
 */
/** The parts of a KeyboardEvent this cares about. Structural, so tests need no DOM. */
export interface KeyPress {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}
/**
 * ⌘S on a Mac, Ctrl+S everywhere else. Both are accepted on every platform:
 * a Mac on an external keyboard has both keys and a hand hits whichever it
 * remembers.
 *
 * ⇧ and ⌥ are left alone. ⌘⇧S is "Save As" in some browsers and nothing in
 * others, and a shortcut that means something different per browser is not
 * one worth taking over. `key` is checked in both cases so that Caps Lock —
 * which uppercases the key without setting `shiftKey` — does not lock the
 * shortcut out.
 */
export declare function isSaveShortcut(e: KeyPress): boolean;
/**
 * What an `onSave` may hand back. A string is shown in the toast; anything
 * else keeps quiet — for the app that already shows its own receipt, or the
 * screen where there is nothing to save.
 */
export type SaveMessage = string | null | undefined | void;
export type ToastPosition = "top" | "bottom";
export interface ToastOptions {
    /** How long the toast stays up, in ms. Default 1800. */
    duration?: number;
    /** Which edge of the screen it sits at. Default `"bottom"`. */
    position?: ToastPosition;
}
/** The two methods used on `window`; tests hand in a bare `EventTarget`. */
export interface ListenerTarget {
    addEventListener(type: "keydown", listener: (e: Event) => void): void;
    removeEventListener(type: "keydown", listener: (e: Event) => void): void;
}
export interface InterceptSaveOptions extends ToastOptions {
    /**
     * The app's own save, run on every ⌘S. Whatever it returns — or resolves to
     * — goes in the toast; see `SaveMessage`. Leave it out to only keep the
     * browser's dialog away.
     *
     * A save that fails should say so itself, by returning the message it wants
     * shown: a throw or a rejection is logged, and nothing is shown, because a
     * library that lives on Spanish pages and English ones has no words of its
     * own to fall back on.
     */
    onSave?: () => SaveMessage | Promise<SaveMessage>;
    /** Where to listen. Default `window`. */
    target?: ListenerTarget;
}
/**
 * Take over ⌘S / Ctrl+S on the page. Returns the function that gives it back.
 *
 * The browser's default is prevented on every press of the shortcut, even the
 * ones that do not reach `onSave`: a held key auto-repeats, and one dialog on
 * the third repeat would be as bad as one on the first. What does *not* reach
 * `onSave` is a repeat, a press while a previous save is still in flight, and
 * a press some component already claimed with `preventDefault` — a text editor
 * with its own idea of ⌘S, say — since a listener on `window` runs last and
 * should defer to whatever was closer to the keystroke.
 */
export declare function interceptSave(options?: InterceptSaveOptions): () => void;
/**
 * Show a short message at the edge of the screen. One toast at a time: a
 * second call while the first is up replaces its text and restarts the clock.
 *
 * A no-op without a `document`, so a module that calls this can still be
 * imported and tested under Node.
 */
export declare function showToast(message: string, options?: ToastOptions): void;
