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
        vscode.commands.registerCommand('scopedSymbolSearch.search', search)
    );
}

async function search() {
    const folder = getActiveFolder();
    if (!folder) {
        vscode.window.showWarningMessage('No workspace folder active');
        return;
    }

    const qp = vscode.window.createQuickPick<SearchItem>();
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;

    let symbolMode = false;
    let fileItems: SearchItem[] = [];
    let symbolDebounce: ReturnType<typeof setTimeout> | undefined;
    let settingValue = false;

    const folderName = folder.name;

    function setMode(sym: boolean) {
        symbolMode = sym;
        qp.buttons = [sym ? BTN_TO_FILES : BTN_TO_SYMBOLS];
        qp.placeholder = sym
            ? `Search symbols in ${folderName}`
            : `Search files in ${folderName} — type # to search symbols`;
    }

    setMode(false);

    // Load files immediately
    qp.busy = true;
    vscode.workspace
        .findFiles(new vscode.RelativePattern(folder, '**/*'), '{**/node_modules/**,**/.git/**}', 2000)
        .then(uris => {
            fileItems = uris.map(uri => ({
                label: path.basename(uri.fsPath),
                detail: vscode.workspace.asRelativePath(uri, false),
                uri
            }));
            if (!symbolMode) qp.items = fileItems;
            qp.busy = false;
        });

    qp.onDidChangeValue(value => {
        if (settingValue) return;

        if (!symbolMode && value === '#') {
            settingValue = true;
            setMode(true);
            qp.value = '';
            qp.items = [];
            settingValue = false;
            return;
        }

        if (symbolDebounce) clearTimeout(symbolDebounce);

        if (symbolMode) {
            qp.busy = true;
            symbolDebounce = setTimeout(async () => {
                const symbols =
                    (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                        'vscode.executeWorkspaceSymbolProvider',
                        value
                    )) ?? [];
                qp.items = symbols
                    .filter(s => s.location.uri.fsPath.startsWith(folder.uri.fsPath))
                    .map(s => ({
                        label: `$(symbol-${kindIcon(s.kind)}) ${s.name}`,
                        description: s.containerName,
                        detail: vscode.workspace.asRelativePath(s.location.uri, false),
                        symbol: s
                    }));
                qp.busy = false;
            }, 200);
        } else {
            qp.items = fileItems;
        }
    });

    qp.onDidTriggerButton(() => {
        settingValue = true;
        setMode(!symbolMode);
        qp.value = '';
        qp.items = symbolMode ? [] : fileItems;
        settingValue = false;
    });

    qp.onDidAccept(async () => {
        const item = qp.selectedItems[0];
        if (!item) return;
        qp.hide();

        if (item.symbol) {
            const doc = await vscode.workspace.openTextDocument(item.symbol.location.uri);
            const editor = await vscode.window.showTextDocument(doc);
            editor.selection = new vscode.Selection(
                item.symbol.location.range.start,
                item.symbol.location.range.start
            );
            editor.revealRange(item.symbol.location.range, vscode.TextEditorRevealType.InCenter);
        } else if (item.uri) {
            await vscode.window.showTextDocument(item.uri);
        }
    });

    qp.onDidHide(() => qp.dispose());
    qp.show();
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
