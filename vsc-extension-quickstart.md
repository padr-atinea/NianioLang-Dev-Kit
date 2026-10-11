# NianioLang Dev Kit – developer quickstart

## Run and debug

* `npm install` (the only runtime dependency is `ignore`; there is no build step – the sources in `src/` are loaded directly).
* Press `F5` – the `Extension` configuration in `.vscode/launch.json` opens a new window (`code-insiders`) with the extension loaded. Open a folder with a NianioLang 2 project there.
* After changes relaunch from the debug toolbar or reload the window (`Ctrl+R`).
* Logs: the Debug Console of the main window (`console.log`) and the *NianioLang Dev Kit* output channel.
* Enable `nianiolang.debugMode` to get the **Analysis Monitor** (live view of parsing and type checks), *Show Module Object* and internal token data in hovers.

## Package and install

* `npm run package` – builds `nianiolang-dev-kit-<version>.vsix` (requires `vsce`: `npm install -g @vscode/vsce`).
* `npm run install` – installs the newest `.vsix` into VS Code (bash).
* Bump `version` in `package.json` (and `package-lock.json`) before packaging.

## Project structure

| Path | Contents |
| --- | --- |
| `package.json` | Manifest: languages, grammars, commands, settings, menus |
| `syntaxes/`, `language-configuration*.json` | TextMate grammars and language configuration for `.nl` and `.gr` |
| `src/extension.js` | Activation, registration of commands, providers (definition, completion, hover, rename, references, code lens, inlay hints) and event handlers |
| `src/moduleManager.js` | State of all modules: parsing (`updateModule`), loading from disk, caches of references / imports / types, type checking of a module (`checkModuleTypes`), pretty print |
| `src/analysisScheduler.js` | Global management of analysis: debounced parsing, cancellable background type check jobs with priorities, invalidation of dependent modules |
| `src/analysisMonitor.js` | Debug mode monitor (webview) |
| `src/positionTracker.js` | Maps the results of the last type check to the current text while the document is edited |
| `src/diagnosticsManager.js` | Publishing of diagnostics |
| `src/patchManager.js` | Generate / apply patch commands |
| `src/nianioLibs/parsers/` | Tokenizer, parser (`nparser`), static checks (`module_checker`), `ptd_parser` |
| `src/nianioLibs/type_checker/` | Type checker (`type_checker`, `ptd_system`, `tct`…), inferred types for inlay hints (`inferred_types`) |
| `src/nianioLibs/printers/` | Pretty printers: `pretty_printer` (builds the layout structure), `wprinter` (classic layout), `modern_pretty_printer` (modern layout); `dfile` (`.gr`/df files), `js_printer` |
| `src/nianioLibs/base/` | Runtime helpers (`ov` variants, `hash`, `array`, `json_clone`…) |

## How the analysis works

1. **Startup** – all `.nl` files of the workspace (except ignored ones) are read from disk and parsed; type checks of open tabs are queued.
2. **Edit** – the document is parsed 200 ms after the last change (immediately when a language feature needs it – `ensureParsed`). If the interface of the module (public signatures and types) changed, all modules depending on it are marked outdated.
3. **Type check** – one job per module, run cooperatively: the checker is a generator, between functions the job yields to the event loop, can be paused by a more important job (active editor > visible > open tabs > others) or cancelled when its input changes. Each module has a `stamp` (version of its input) and `checkedStamp`.
4. **Results** – stored with the document version they were computed for; `positionTracker` keeps them in place while the text is edited.

## Testing

There is no automated test suite in the repository. Changes of the parser, checker or printers should be verified on real NianioLang 2 projects (e.g. `instadb17.base`, `nl2`) – NianioLang 1 projects (e.g. `instadb14.base`) are not supported:

* results of the parser and the type checker before and after the change should be identical (compare errors, warnings and `varPositions` of all modules),
* pretty printed modules must parse without errors, mean the same program and be stable (printing twice gives the same result),
* the scheduler can be exercised in Node with a stub of the `vscode` module.

## Conventions

* Source files use tabs and CRLF line endings.
* Code in `src/nianioLibs` is a translation of the NianioLang libraries – keep its structure and naming (`snake_case`), the extension code uses `camelCase`.
* `DC` (deep copy) is `json_clone` – the same semantics as `JSON.parse(JSON.stringify(x))`, but faster; avoid deep copies in hot paths.
