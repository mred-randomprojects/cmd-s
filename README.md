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

**From a single HTML file** — pinned to a tag on jsDelivr, with the file's
hash so the browser refuses any other bytes. The import map goes in `<head>`,
before any module script; if the page already has one, add the `integrity`
key to it rather than a second map.

```html
<script type="importmap">
{
  "integrity": {
    "https://cdn.jsdelivr.net/gh/mred-randomprojects/cmd-s@1.0.0/dist/cmd-s.js": "sha384-PFN7FojT4754YsJFOeWsOSVw3uxilW0wmkUVMnae3Xfny7DPcGRZ/Z3fmm4LNfM5"
  }
}
</script>

<script type="module">
  import { interceptSave } from "https://cdn.jsdelivr.net/gh/mred-randomprojects/cmd-s@1.0.0/dist/cmd-s.js";
  interceptSave({ onSave: () => "Guardado" });
</script>
```

Every app on the site shares one origin, so a tampered file would reach all of
their storage; the hash is what stops it. Keep the import in a script of its
own: a refused file then only costs ⌘S. Browsers without import-map integrity
ignore the key and load the file as before. The hash changes with every
version (see Releasing).

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

Node 22, from `.nvmrc` (`nvm use`); the toast tests need Node's mock timers.

```bash
npm test         # node:test, no browser
npm run build    # tsc → a fresh dist/, which is committed so consumers need no build
npm run check    # both, then fails unless dist/ matches the commit exactly
```

`dist/` is committed on purpose: it is what jsDelivr serves and what npm gets
from the tag. CI fails if it is out of date with `src/`, including a new
emitted file that was never committed or a stale one whose source is gone.
`demo.html` is there to look at the toast — `python3 -m http.server` and open
it.

### Releasing

A pushed tag is for good: jsDelivr caches it as immutable for a year, so a bad
release can only be superseded by a new version, never fixed in place. Never
move or delete a published tag.

1. Bump the version with `npm version X.Y.Z --no-git-tag-version` (it updates
   `package.json` and the lockfile, and tags nothing yet), then every pinned
   version in the docs — two in the header comment of `src/cmd-s.ts`, three in
   Use above (the npm tag, and the jsDelivr URL in both the import map and the
   import): `grep -nE 'cmd-s(@|#v)[0-9]' src/cmd-s.ts README.md`
2. `npm run build`, then put the new file's hash in the import map above:
   `echo "sha384-$(openssl dgst -sha384 -binary dist/cmd-s.js | openssl base64 -A)"`
3. Commit `src/`, `dist/`, `package.json`, `package-lock.json` and `README.md`
   together, then run `npm run check`. It compares `dist/` with the commit, so
   it only passes once the new `dist/` is committed.
4. Push `main` and wait for its **Checks** run to go green:
   ```bash
   git push origin main
   gh run list --commit "$(git rev-parse HEAD)" --workflow checks.yml   # its id, once it shows up
   gh run watch <id> --exit-status
   ```
5. Only then tag that commit and push that one tag (`--tags` would push every
   local tag, and not `main`):
   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
6. Check that jsDelivr serves the same bytes — this must print the hash from
   step 2 — then bump the consumers below:
   ```bash
   echo "sha384-$(curl -s https://cdn.jsdelivr.net/gh/mred-randomprojects/cmd-s@X.Y.Z/dist/cmd-s.js | openssl dgst -sha384 -binary | openssl base64 -A)"
   ```

## Consumers

Each one pins a version, so a release reaches nobody until it is bumped there.
All of them are on v1.0.0 as of October 2026:

- **npm**, through the tag in `package.json` (reinstall so the lockfile moves
  too): age-defense, candito-tool, dineros, execute (pnpm), fulbito,
  guess-class-lol, nutriapp.
- **jsDelivr**, in `index.html` (the version in both URLs and the hash change
  together): minecraft-ladder, procedural-generation, viaje-matematico,
  yugioh-gallery.

Re-derive the list before a release, since it goes stale (a clone's folder
name can differ from its repo: `git -C <dir> remote get-url origin`):

```bash
grep -lE 'mred-randomprojects/cmd-s(#|@)' ~/Documents/Programming/*/package.json ~/Documents/Programming/*/index.html
```

## License

MIT
