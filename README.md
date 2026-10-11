# NianioLang Dev Kit

NianioLang Dev Kit is a Visual Studio Code extension that provides a full-featured development experience for the NianioLang 2 programming language: navigation, completion, type checking, formatting and refactoring tools.

## Features

### Editing and navigation
- **Syntax highlighting** – TextMate grammar for `.nl` and `.gr` files.
- **Go To Definition** – Ctrl+Click (or F12) on a function, variable or `use` to jump to its definition, also across modules.
- **IntelliSense** – completion of module names, public and private functions, variables and record fields; snippets with parameter placeholders; the `use` of a module is added automatically when its function is selected.
- **Signature Help** – parameter hints inside call parentheses (Ctrl+Shift+Space).
- **Hover** – types of variables and fields (with adjustable depth of expanding named types), method source and its external dependencies.
- **Rename Symbol** – variables within a function, functions across all modules.
- **Find References** and **Code Lens** with reference counts above each method.

### Diagnostics and type checking
- **Static diagnostics** – syntax errors, missing / unused / duplicated imports, unknown and uninitialized variables, incorrect module names and more.
- **Type checking** – errors and warnings of the NianioLang type checker, computed in the background.
- **Inferred types** (optional) – grey inlay hints with the types of declarations which have no explicit type, when the type checker determines them unambiguously: `var` declarations, function parameters and function return types (iterators of `for` / `fora` / `forh` / `rep` are skipped). Hover shows the contents of the type, click adds it to the declaration (together with the `use` of the module it needs). Every hint is verified – adding all of them does not cause new type errors in the module. For public functions the change of the interface is not verified in other modules (the tooltip warns about it).

### Formatting
- **Pretty Print** of the current module, the current method, all modules of the project, and `.gr` files.
- **Modern formatting** (`nianiolang.prettyPrint.modernPrint`) – the content of a construct broken into lines is indented one level more than the line it starts on (instead of one level for every bracket), and multi-line arrays and hashes get a comma after the last element:

  ```
  def access_control_full() : @meta_ptd::type {
  	return mbase::ov([
  		mbase::kv('deny', mbase::none()),
  		mbase::kv('view', mbase::none()),
  	], {function => 'access_field_default'});
  }
  ```
- Formatting changes only the parts of the text which differ (the cursor and the undo history are kept) and does nothing when the code is already formatted.

### On save
Configurable actions: remove unused modules, add missing modules, fix module names, pretty print the module or the method, pretty print `.gr` files. `.nl` files are always saved with LF line endings.

### Patches
- **Generate Patch From Commit** and **Apply Patch** commands.

### Performance
- All modules of the workspace are loaded at startup directly from disk (files ignored by `.gitignore` / `.vscodeignore` are skipped); the editor stays responsive during loading.
- Parsing is debounced while typing; type checks run in the background as cancellable jobs, prioritised by the active editor, visible editors and open tabs.
- A change of a module re-checks only the modules whose input changed: a change inside a function body re-checks only that module, a change of the interface (public signatures and types) also the modules which depend on it. A new change cancels only the checks it makes outdated – checks of independent modules keep running.
- Results of the last type check (hover, go to definition, errors, inferred types) follow the edited text until the module is checked again.
- Changes of files outside the editor (e.g. `git checkout`) are picked up by a file watcher.

### Debug mode
With `nianiolang.debugMode` enabled:
- **Analysis Monitor** (status bar `NL monitor`, Code Lens at the top of a file or the command *NianioLang: Show Analysis Monitor*) – live timeline of parsing, type checks, pauses, cancellations and main thread blocking, the queue of jobs, state of open modules and a log of events with their reasons.
- **Show Module Object** – the internal state of the module (Code Lens at the top of a file).
- Hover shows the internal data of the token.

## Commands

| Command | Description |
| --- | --- |
| NianioLang: Pretty Print Current Module | Formats the current module |
| NianioLang: Pretty Print Current Method | Formats the method under the cursor |
| NianioLang: Pretty Print All Modules | Formats all modules of the project (asks for confirmation, skips modules with errors, summary in the *NianioLang Dev Kit* output) |
| NianioLang: Pretty Print GR File | Formats a `.gr` file |
| NianioLang: Update All Files Diagnostics | Re-publishes the diagnostics of all modules |
| NianioLang: Refactor to JS (experimental) | Converts the current module into JavaScript |
| NianioLang: Show Module Object | Shows the internal state of the current module |
| NianioLang: Show Analysis Monitor (debug mode) | Opens the analysis monitor |
| NianioLang: Generate Patch From Commit | Generates a patch from a git commit |
| NianioLang: Apply Patch | Applies a patch |

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `nianiolang.checkTypes` | `On change and save` | When types are checked: `none`, `On change and save`, `On save` |
| `nianiolang.checkTypesScope` | `Open files` | Which modules depending on a changed module are re-checked in the background: `Open files` or `All files` (others are checked when opened) |
| `nianiolang.inlayHints.inferredTypes` | `false` | Inlay hints with inferred types of declarations without a type (needs type checking; makes the checks about 3× slower) |
| `nianiolang.prettyPrint.modernPrint` | `true` | Modern formatting (see above) |
| `nianiolang.onPrettyPrintModule.removeMod` | `false` | Pretty print replaces statement modifiers (`... if cond;`, `... unless cond;`, short loops) with blocks |
| `nianiolang.onPrettyPrintModule.printNewStamp` | `false` | Pretty print adds the copyright stamp to modules without one |
| `nianiolang.onSave.prettyPrint` | `none` | `none`, `Current module`, `Current method` |
| `nianiolang.onSave.prettyPrintGr` | `false` | Pretty print `.gr` files on save |
| `nianiolang.onSave.removeUnusedModules` | `false` | Remove unused `use` on save (only when the module has no errors) |
| `nianiolang.onSave.addMissingModules` | `false` | Add missing `use` on save |
| `nianiolang.onSave.fixModuleNames` | `false` | Fix incorrect module names on save |
| `nianiolang.onMethodHover.showDependencies` | `true` | Method hover shows its external dependencies |
| `nianiolang.onMethodHover.showReferenceCount` | `false` | Method hover shows the number of references |
| `nianiolang.onFieldHover.showReferenceCount` | `false` | Variable hover shows the number of references |
| `nianiolang.onGeneratePatchFromCommit.listOfExcludedFiles` | *(list)* | Files excluded from generated patches |
| `nianiolang.onGeneratePatchFromCommit.useCommitMessage` | `false` | Use the commit message in the generated patch |
| `nianiolang.debugMode` | `false` | Debug mode (analysis monitor, module object, internal data in hover) |

## Requirements

- Visual Studio Code 1.98 or newer.
- Projects in NianioLang 2. Module names have to be unique in the workspace (a module is identified by its file name).

## License

This extension is licensed under the MIT License.

## Feedback

Please open issues or submit pull requests on our [GitHub repository](https://github.com/padr-atinea/NianioLang-Dev-Kit) to help us improve NianioLang Dev Kit.
This is a fork of NianioLang-Code extension.
