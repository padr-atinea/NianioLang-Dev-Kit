# NianioLang Dev Kit

NianioLang Dev Kit is a Visual Studio Code extension that provides a full-featured development experience for the NianioLang programming language. It goes far beyond basic syntax highlighting and offers powerful IDE-like features to streamline your coding workflow.

## Features

- **Syntax Highlighting:** Advanced TextMate grammar for clear and precise code coloring.
- **Go To Definition:** Quickly navigate to a function’s definition within the current or external modules using Ctrl+Click.
- **IntelliSense & Code Completion:** Autocomplete function names and view inline signature help with parameter information and return types.
- **Signature Help:** Automatically display parameter hints as you type, with active parameter highlighting (trigger with Ctrl+Shift+Space or via autocompletion).
- **Diagnostics:** Real-time error detection for issues like missing module imports and incorrect parameter counts.
- **Quick Fixes (Code Actions):** Instantly add missing module imports or convert a private method into a public one.


- **Syntax highlighting:** Advanced TextMate grammar for clear and precise code coloring
- **Go To Definition:** Ctrl+Click (or F12) to navigate to a function’s definition within the current module or external modules
- **IntelliSense & Code Completion:** Autocomplete module names, public and private functions, variables and fields; insert snippets with parameter placeholders
- **Signature Help:** Automatic parameter hints as you type inside call parentheses, with active parameter highlighting (trigger manually with Ctrl+Shift+Space)
- **Diagnostics:** Real-time error detection for missing imports, incorrect parameter counts, unused or duplicated modules, incorrect module names and more
- **Quick Fixes (Code Actions):** Add missing module imports, remove unused imports, convert private methods into public ones, fix module names, remove all unnecessary usings in a file
- **Rename Symbol:** Rename definitions and all references across modules
- **Find References:** Show all locations where a symbol is used
- **Hover:** Display type constructor information on variables and functions
- **Code Lens:** Shows reference counts above each method
- **Pretty Print:** Commands to format the entire module or the current method (extension.prettyPrintModule, extension.prettyPrintMethod)
- **On-Save Actions:** Configurable options to remove unused modules, add missing modules, fix module names and pretty print on save
- **File Watchers:** Automatically reload and reindex .nl files when they are created, changed or deleted
- **Update Diagnostics:** Command to re-run diagnostics on all .nl files (extension.updateAllDiagnostics)
- **Refactor to JavaScript:** Experimental command to convert a NianioLang module into a JavaScript file (extension.refactorToJS)

## Configuration

NianioLang Dev Kit activates automatically on files with the `nianiolang` language mode. For advanced users, keybindings and other settings can be customized in VS Code’s settings.
- nianiolang.onSave.prettyPrint (string) - none | Current module | Current method
- nianiolang.onSave.removeUnusedModules (boolean)
- nianiolang.onSave.addMissingModules (boolean)
- nianiolang.onSave.fixModuleNames (boolean)
- nianiolang.onPrettyPrintModule.removeMod (boolean)
- nianiolang.onPrettyPrintModule.printNewStamp (boolean)
- nianiolang.onMethodHover.showReferenceCount (boolean)

## License

This extension is licensed under the MIT License.

## Feedback

Please open issues or submit pull requests on our [GitHub repository](https://github.com/padr-atinea/NianioLang-Dev-Kit) to help us improve NianioLang Dev Kit.
This is a fork of NianioLang-Code extension.
