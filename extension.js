// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const hljs = require('highlight.js/lib/core');
hljs.registerLanguage('json', require('highlight.js/lib/languages/json'));

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

let panel;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const disposable = vscode.commands.registerCommand('extension.prettifyJSON', function () {
		// The code you place here will be executed every time your command is executed
		panel = createWebviewPanel();
        updatePrettifiedJSON();

		// Display a message box to the user
		// vscode.window.showInformationMessage('Hello World from pretty-json!');
	});

	context.subscriptions.push(disposable);

	// listen to the selection change event
	vscode.window.onDidChangeTextEditorSelection((event) => {
		updatePrettifiedJSON();
	}, null, context.subscriptions);
}

// This method is called when your extension is deactivated
function deactivate() {}

function updatePrettifiedJSON() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const selection = editor.selection;
        const text = editor.document.getText(selection);
        
        try {
            const jsonObject = JSON.parse(text.trim());
            const prettifiedJSON = JSON.stringify(jsonObject, null, 2);
            
            if (!panel) {
                panel = createWebviewPanel();
            }
            
            panel.webview.html = getWebviewContent(prettifiedJSON);
        } catch {
			// ignore invalid JSON
        }
    }
}

function createWebviewPanel() {
	return vscode.window.createWebviewPanel(
		'prettifiedJSON',
		'Prettified JSON',
		vscode.ViewColumn.Beside,
		{}
	);
}

function getWebviewContent(content) {
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Prettified JSON</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/arta.min.css">
		<style>
		.hljs, .hljs code {
			background: transparent !important;
		}
		</style>
    </head>
    <body>
		<pre><code class=hljs>${highlightJson(content)}</code></pre>
    </body>
    </html>`;
}

function highlightJson(code) {
	return hljs.highlight(code, {language: 'json'}).value;
}

module.exports = {
	activate,
	deactivate
}
