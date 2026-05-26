import * as vscode from 'vscode';
import * as path from 'path';

interface SearchItem extends vscode.QuickPickItem {
    uri?: vscode.Uri;
    symbol?: vscode.SymbolInformation;
}

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
    qp.placeholder = `Search in ${folder.name} — prefix # for symbols`;
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;

    let fileItems: SearchItem[] = [];

    qp.busy = true;
    vscode.workspace
        .findFiles(new vscode.RelativePattern(folder, '**/*'), '{**/node_modules/**,**/.git/**}', 2000)
        .then(uris => {
            fileItems = uris.map(uri => ({
                label: path.basename(uri.fsPath),
                detail: vscode.workspace.asRelativePath(uri, false),
                uri
            }));
            if (!qp.value.startsWith('#')) {
                qp.items = fileItems;
            }
            qp.busy = false;
        });

    let symbolDebounce: ReturnType<typeof setTimeout> | undefined;

    qp.onDidChangeValue(value => {
        if (symbolDebounce) clearTimeout(symbolDebounce);

        if (value.startsWith('#')) {
            const query = value.slice(1);
            qp.busy = true;
            symbolDebounce = setTimeout(async () => {
                const symbols =
                    (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                        'vscode.executeWorkspaceSymbolProvider',
                        query
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
    if (uri) {
        return vscode.workspace.getWorkspaceFolder(uri);
    }
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
