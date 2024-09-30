// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const hljs = require('highlight.js/lib/core');
hljs.registerLanguage('json', require('highlight.js/lib/languages/json'));

const GLOBAL_STATE_WRAP_TOGGLE = 'wrap-toggle';
const GLOBAL_STATE_THEME = 'theme';

let panel;
let theme;
let wrap;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  theme = context.globalState.get(GLOBAL_STATE_THEME, 'default');
  wrap = context.globalState.get(GLOBAL_STATE_WRAP_TOGGLE, false);

  const disposable = vscode.commands.registerCommand('extension.prettyJSON', function () {
    // The code you place here will be executed every time your command is executed
    panel = createWebviewPanel(context);
    updatePrettifiedJSON(context);

    // Display a message box to the user
    // vscode.window.showInformationMessage('Hello World from pretty-json!');
  });

  context.subscriptions.push(disposable);

  // listen to the selection change event
  vscode.window.onDidChangeTextEditorSelection((event) => {
    updatePrettifiedJSON(context);
  }, null, context.subscriptions);
}

// This method is called when your extension is deactivated
function deactivate() { }

function updatePrettifiedJSON(context) {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selection = editor.selection;
    const text = editor.document.getText(selection);

    if (!panel) {
      panel = createWebviewPanel(context);
    }

    try {
      const jsonObject = JSON.parse(text.trim());
      const prettifiedJSON = JSON.stringify(jsonObject, null, 2);

      panel.webview.html = getWebviewContent(prettifiedJSON);
    } catch {
      panel.webview.html = getWebviewContent('');
    }
  }
}

function createWebviewPanel(context) {
  let panel = vscode.window.createWebviewPanel(
    'prettifiedJSON',
    'Prettified JSON',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true
    }
  );

  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.command) {
        case 'themeChanged':
          theme = message.theme;
          context.globalState.update(GLOBAL_STATE_THEME, theme);
          break;
        case 'wrapChanged':
          wrap = message.wrap;
          context.globalState.update(GLOBAL_STATE_WRAP_TOGGLE, wrap);
          break;
        case 'logMessage':
          console.log(message.text);
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  return panel;
}

function getWebviewContent(content) {
  const themeHtml = getThemesHtml();
  return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Prettified JSON</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${theme}.min.css">
    <style>
    .hljs, .hljs code { background: transparent !important; }
    .hljs { counter-reset: line; }
    .line-number { counter-increment: line; width: 2em; display: inline-block; text-align: right;
      padding-right: 0.5em; margin-right: 0.5em; color: rgba(128, 128, 128, 0.5); border-right: 1px solid rgba(128, 128, 128, 0.4); }
    .toolbar { padding: 5px; background-color: rgba(128, 128, 128, 0.2); backdrop-filter: blur(5px); }
    .button { padding-right: 10px; padding-left: 10px; }
    .unselectable {
      -webkit-user-select: none; /* Safari */
      -ms-user-select: none; /* IE 10 and IE 11 */
      user-select: none; /* Standard syntax */
    }
    </style>
    </head>
    <body>
      <div class="toolbar unselectable">
        <label class='button'><input type="checkbox" id="wrap-toggle" /> Wrap Text</label>
        <label class='button'>Theme <select id="theme-select">
          ${themeHtml}
        </select></label>
      </div>
      <pre><code id="json-code" class=hljs>${highlightJson(content)}</code></pre>
      <script>
        const vscode = acquireVsCodeApi();
        const codeElement = document.getElementById('json-code');
        const wrapToggle = document.getElementById('wrap-toggle');
        const themeSelect = document.getElementById('theme-select');

        wrapToggle.addEventListener('change', (e) => {
          codeElement.style.whiteSpace = e.target.checked ? 'pre-wrap' : 'pre';
          vscode.postMessage({
            command: 'wrapChanged',
            wrap: e.target.checked
          });
        });

        themeSelect.addEventListener('change', (e) => {
          const theme = e.target.value;
          const link = document.querySelector('link[rel="stylesheet"]');
          link.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/"+theme+".min.css";

          // send message to the mothership
          vscode.postMessage({
            command: 'themeChanged',
            theme: theme
          });
        });

        // initial theme
        themeSelect.value = '${theme}';
        wrapToggle.checked = ${wrap};
        codeElement.style.whiteSpace = "${wrap ? 'pre-wrap' : 'pre'}";
      </script>
    </body>
    </html>`;
}

function highlightJson(code) {
  const highlightedCode = hljs.highlight(code, { language: 'json' }).value;
  const lines = highlightedCode.split('\n');
  return lines.map((line, index) => 
    `<span class="line-number unselectable">${index + 1}</span>${line}`
  ).join('\n');
}

function getThemesHtml() {
  let themeHtml = `<option value="default">default</option>
  <option disabled> ─────── </option>
  `;
  getThemes().forEach((aTheme) => {
    if (aTheme === 'default') {
      return;
    }
    themeHtml += `<option value="${aTheme}">${aTheme}</option>`;
  });
  return themeHtml;
}

function getThemes() {
  // path to the highlight.js styles directory
  const stylesDir = path.join(__dirname, 'node_modules', 'highlight.js', 'styles');

  try {
    const files = fs.readdirSync(stylesDir);

    // de-dup
    const themesSet = new Set();

    files.forEach(file => {
      if (file.endsWith('.css')) {
        let themeName = path.basename(file, '.css');
        themeName = themeName.replace(/\.min$/, '');  // remove `.min`
        themesSet.add(themeName);
      }
    });

    // Convert Set to Array and sort alphabetically
    return Array.from(themesSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } catch (err) {
    console.error(`error reading styles directory ${stylesDir}:`, err);
    return [];
  }
}

module.exports = {
  activate,
  deactivate
}
