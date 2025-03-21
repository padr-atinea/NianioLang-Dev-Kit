# NianioLang Dev Kit

NianioLang Dev Kit is a Visual Studio Code extension that provides a full-featured development experience for the NianioLang programming language. It goes far beyond basic syntax highlighting and offers powerful IDE-like features to streamline your coding workflow.

## Features

- **Syntax Highlighting:** Advanced TextMate grammar for clear and precise code coloring.
- **Go To Definition:** Quickly navigate to a function’s definition within the current or external modules using Ctrl+Click.
- **IntelliSense & Code Completion:** Autocomplete function names and view inline signature help with parameter information and return types.
- **Signature Help:** Automatically display parameter hints as you type, with active parameter highlighting (trigger with Ctrl+Shift+Space or via autocompletion).
- **Diagnostics:** Real-time error detection for issues like missing module imports and incorrect parameter counts.
- **Quick Fixes (Code Actions):** Instantly add missing module imports or convert a private method into a public one.

## Usage

- **Go To Definition:** Ctrl+Click on any function name to jump to its definition.
- **Code Completion:** Type a module name followed by `::` to see a list of public functions, complete with signature previews.
- **Signature Help:** When inside function call parentheses, VS Code displays parameter hints. You can also trigger it manually with `Ctrl+Shift+Space`.
- **Quick Fixes:** When issues such as missing imports or wrong parameter counts are detected, click the lightbulb icon to see available fixes.

## Configuration

NianioLang Dev Kit activates automatically on files with the `nianiolang` language mode. For advanced users, keybindings and other settings can be customized in VS Code’s settings.

## Changelog

- **Enhanced Navigation:** Added Go To Definition, Hover, and Reference providers.
- **Improved IntelliSense:** Integrated signature help with parameter highlighting.
- **Real-Time Diagnostics:** Now detects missing module imports and incorrect parameter counts.
- **Quick Fixes:** Added Code Actions for common issues.

## License

This extension is licensed under the MIT License.

## Feedback

Please open issues or submit pull requests on our [GitHub repository](https://github.com/padr-atinea/NianioLang-Dev-Kit) to help us improve NianioLang Dev Kit.
This is a fork of NianioLang-Code extension.
