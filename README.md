# Scoped Search

Search files and symbols scoped to the active workspace folder. In multi-root workspaces, the built-in search covers all folders at once, which can be noisy. This extension lets you search only within the folder you are currently working in.

## Usage

Press `Cmd+Alt+T` (Mac) or `Ctrl+Alt+T` (Windows/Linux) to open the search picker.

- Start typing to search files in the active folder
- Type `#` or click the symbol icon to switch to symbol search
- In symbol mode, clear the input completely (backspace until empty) to return to file search

The active folder is determined by the file open in the editor. If no file is open, the first workspace folder is used.

## Requirements

No additional setup required. Works with any language that provides workspace symbol support.
