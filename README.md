# cmd-s

Keep ⌘S / Ctrl+S from saving the web page. Run the app's own save instead, and
say so in a small toast.

Every app on [mred-randomprojects.github.io](https://mred-randomprojects.github.io)
saves itself — there is no Save button anywhere — but hands remember ⌘S, and in
a browser that opens the "Save page as…" dialog. This swallows the shortcut and
hands it to the app. Zero dependencies, no framework, about 60 lines that matter.

## Use

**From a Vite / npm project** — depend on the tag, not on a registry:

```json
"dependencies": {
  "cmd-s": "github:mred-randomprojects/cmd-s#v1.0.0"
}
```

```ts
import { interceptSave } from "cmd-s";

// Somewhere that runs once, e.g. the app root's effect. Returns the uninstall.
const release = interceptSave({
  onSave: () => {
    flushPendingWrites();
    return "Saved"; // shown in the toast; return nothing to stay quiet
  },
});
```

**From a single HTML file** — pinned to a tag on jsDelivr:

```html
<script type="module">
  import { interceptSave } from "https://cdn.jsdelivr.net/gh/mred-randomprojects/cmd-s@1.0.0/dist/cmd-s.js";
  interceptSave({ onSave: () => "Guardado" });
</script>
```

**Only keep the dialog away** — for a page with nothing to save:

```ts
interceptSave();
```

## API

```ts
interceptSave(options?: {
  onSave?: () => SaveMessage | Promise<SaveMessage>; // string → toast; else silent
  duration?: number;          // ms the toast stays; default 1800
  position?: "top" | "bottom"; // default "bottom"
  target?: ListenerTarget;    // default window
}): () => void;               // call to hand the shortcut back

showToast(message: string, options?: { duration?: number; position?: "top" | "bottom" }): void;

isSaveShortcut(e: { key; metaKey; ctrlKey; altKey; shiftKey }): boolean;
```

What `interceptSave` does on a press: `preventDefault()` always, `onSave` once
per distinct press — not on key auto-repeat, not while a previous save is still
in flight, and not if some component closer to the keystroke already called
`preventDefault()` (a text editor with its own ⌘S, say). ⌘⇧S and ⌥⌘S are left
to the browser.

A save that fails should return the message it wants shown; a throw or a
rejection is logged to the console and nothing is shown, since the library has
no language of its own to apologise in.

## Develop

```bash
npm test         # node:test, no browser
npm run build    # tsc → dist/, which is committed so consumers need no build
npm run check    # both, then fails if dist/ is stale
```

`dist/` is committed on purpose: it is what jsDelivr serves and what npm gets
from the tag. CI fails if it is out of date with `src/`. `demo.html` is there
to look at the toast — `python3 -m http.server` and open it.

### Releasing

Bump `version` in `package.json`, `npm run build`, commit, then:

```bash
git tag v1.x.y && git push --tags
```

Consumers move by editing the tag in their `package.json` / `<script>` URL.

## License

MIT
