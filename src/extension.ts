import * as vscode from 'vscode';
import * as path from 'path';

interface SearchItem extends vscode.QuickPickItem {
    uri?: vscode.Uri;
    symbol?: vscode.SymbolInformation;
}

const BTN_TO_SYMBOLS: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('symbol-class'),
    tooltip: 'Switch to symbol search'
};
const BTN_TO_FILES: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('file'),
    tooltip: 'Switch to file search'
};

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('scopedSearch.search', search)
    );
}

async function search() {
    const folder = getActiveFolder();
    if (!folder) {
        vscode.window.showWarningMessage('No workspace folder active');
        return;
    }

    // Shared file cache across QP instances within one search session.
    let fileItems: SearchItem[] = [];
    let fileItemsReady = false;
    const fileLoad = vscode.workspace
        .findFiles(new vscode.RelativePattern(folder, '**/*'), '{**/node_modules/**,**/.git/**}', 2000)
        .then(uris => {
            fileItems = uris.map(uri => ({
                label: path.basename(uri.fsPath),
                detail: vscode.workspace.asRelativePath(uri, false),
                uri,
            }));
            fileItemsReady = true;
        });

    openFileSearch();

    // ── File mode ────────────────────────────────────────────────────────────

    function openFileSearch() {
        const qp = vscode.window.createQuickPick<SearchItem>();
        qp.matchOnDescription = true;
        qp.matchOnDetail = true;
        qp.placeholder = `Search files in ${folder!.name} (type # to search symbols)`;
        qp.buttons = [BTN_TO_SYMBOLS];

        if (fileItemsReady) {
            qp.items = fileItems;
        } else {
            qp.busy = true;
            fileLoad.then(() => {
                qp.items = fileItems;
                qp.busy = false;
            });
        }

        let switchingToSymbol = false;

        qp.onDidChangeValue(value => {
            if (value === '#') {
                switchingToSymbol = true;
                qp.hide();
            }
            // else: built-in QuickPick filter handles file search
        });

        qp.onDidTriggerButton(() => {
            switchingToSymbol = true;
            qp.hide();
        });

        qp.onDidAccept(async () => {
            const item = qp.selectedItems[0];
            if (!item?.uri) return;
            qp.dispose();
            await vscode.window.showTextDocument(item.uri);
        });

        qp.onDidHide(() => {
            qp.dispose();
            if (switchingToSymbol) openSymbolSearch();
        });

        qp.show();
    }

    // ── Symbol mode ───────────────────────────────────────────────────────────

    function openSymbolSearch() {
        const qp = vscode.window.createQuickPick<SearchItem>();
        qp.matchOnDescription = true;
        qp.matchOnDetail = true;
        qp.placeholder = `Search symbols in ${folder!.name}`;
        qp.buttons = [BTN_TO_FILES];

        let symbolDebounce: ReturnType<typeof setTimeout> | undefined;
        let switchingToFile = false;

        function searchSymbols(query: string) {
            if (symbolDebounce) clearTimeout(symbolDebounce);
            qp.busy = true;
            symbolDebounce = setTimeout(async () => {
                const symbols =
                    (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                        'vscode.executeWorkspaceSymbolProvider',
                        query
                    )) ?? [];
                qp.items = symbols
                    .filter(s => s.location.uri.fsPath.startsWith(folder!.uri.fsPath))
                    .map(s => ({
                        label: `$(symbol-${kindIcon(s.kind)}) ${s.name}`,
                        description: s.containerName,
                        detail: vscode.workspace.asRelativePath(s.location.uri, false),
                        symbol: s,
                    }));
                qp.busy = false;
            }, 200);
        }

        // Trigger an initial empty search so symbols appear immediately on open.
        searchSymbols('');

        qp.onDidChangeValue(value => {
            if (value === '') {
                // User backspaced past the last character — return to file mode.
                switchingToFile = true;
                qp.hide();
                return;
            }
            searchSymbols(value);
        });

        qp.onDidTriggerButton(() => {
            switchingToFile = true;
            qp.hide();
        });

        qp.onDidAccept(async () => {
            const item = qp.selectedItems[0];
            if (!item?.symbol) return;
            qp.dispose();
            const doc = await vscode.workspace.openTextDocument(item.symbol.location.uri);
            const editor = await vscode.window.showTextDocument(doc);
            editor.selection = new vscode.Selection(
                item.symbol.location.range.start,
                item.symbol.location.range.start
            );
            editor.revealRange(item.symbol.location.range, vscode.TextEditorRevealType.InCenter);
        });

        qp.onDidHide(() => {
            if (symbolDebounce) clearTimeout(symbolDebounce);
            qp.dispose();
            if (switchingToFile) openFileSearch();
        });

        qp.show();
    }
}

function getActiveFolder(): vscode.WorkspaceFolder | undefined {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (uri) return vscode.workspace.getWorkspaceFolder(uri);
    return vscode.workspace.workspaceFolders?.[0];
}

function kindIcon(kind: vscode.SymbolKind): string {
    const map: Partial<Record<vscode.SymbolKind, string>> = {
        [vscode.SymbolKind.Class]: 'class',
        [vscode.SymbolKind.Constructor]: 'method',
        [vscode.SymbolKind.Enum]: 'enum',
        [vscode.SymbolKind.Function]: 'method',
        [vscode.SymbolKind.Interface]: 'interface',
        [vscode.SymbolKind.Method]: 'method',
        [vscode.SymbolKind.Module]: 'module',
        [vscode.SymbolKind.Property]: 'property',
        [vscode.SymbolKind.Variable]: 'variable',
    };
    return map[kind] ?? 'misc';
}

export function deactivate() {}
