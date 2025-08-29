// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const hljs = require('highlight.js/lib/core');
hljs.registerLanguage('json', require('highlight.js/lib/languages/json'));

const defaultLogger = pino();

const GLOBAL_STATE_WRAP_TOGGLE = 'wrap-toggle';
const GLOBAL_STATE_STICKY_TOGGLE = 'sticky-toggle';
const GLOBAL_STATE_SMART_TOGGLE = 'smart-toggle';
const GLOBAL_STATE_THEME = 'theme';

let panel;
let theme;
let wrap;
let sticky;
let smart;
let latestJson;
let showBMC = false;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  theme = context.globalState.get(GLOBAL_STATE_THEME, 'default');
  wrap = context.globalState.get(GLOBAL_STATE_WRAP_TOGGLE, false);
  sticky = context.globalState.get(GLOBAL_STATE_STICKY_TOGGLE, true);
  smart = context.globalState.get(GLOBAL_STATE_SMART_TOGGLE, true);

  const disposable = vscode.commands.registerCommand('prettyJsonPreview.open', function () {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside);
    }
    else {
      panel = createWebviewPanel(context);
      updatePrettifiedJSON(context);
    }
  });

  context.subscriptions.push(disposable);

  // listen to the selection change event
  vscode.window.onDidChangeTextEditorSelection(() => {
    if (!panel) {
      return;  // it will prevent the panel to reopen when the selection changes
    }
    updatePrettifiedJSON(context);
  }, null, context.subscriptions);
}

// This method is called when your extension is deactivated
function deactivate() { }

const JSON_PREPROCESSORS = [
  (input) => input,
  (input) => input.replace(/\\"/g, '"'),
];

function updatePrettifiedJSON(context, searchKeyword = '', searchInputFocused = false, searchInputSelectionStart = 0, searchInputSelectionEnd = 0) {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selection = editor.selection;

    let textRaw = editor.document.getText(selection);
    if (smart) {
      if (selection.isEmpty) {
        textRaw = editor.document.getText(editor.document.lineAt(selection.active.line).range);
      }
    }
    if (!textRaw) {
      textRaw = '';
    }
    const text = textRaw.trim();

    if (!panel) {
      panel = createWebviewPanel(context);
    }

    let done = false;

    let indices = [] // indices of possible JSON start points to try
    let end_indices = [] // JSON terminating indices to try
    
    if (smart && selection.isEmpty) {
      // If this is a greedy selection, then try and locate any JSON starts which match  
      for (var i=0; i<text.length;i++) {
        if ( ["{", "["].includes(text[i]) ) indices.push(i);
        if ( ["}", "]"].includes(text[i]) ) end_indices.push(i+1);
      }
      end_indices.reverse();
    } else {
      // Only allow the first first character
      indices.push(0);
    }

    let resultJSON = undefined;
    for (let i=0; i<indices.length;i++) {
      // try the longest possible match first
      resultJSON = tryJSONParse(text.substring(indices[i]))
      if (resultJSON !== undefined) {
        // successful result
        break;
      }
      // try parsing successive strings from possible terminators
      for (let k=0; k < end_indices.length;k++) {
        resultJSON = tryJSONParse(text.substring(indices[i], end_indices[k]))
        if (resultJSON !== undefined) {
          // successful result
          break;
        }
      }
      if (resultJSON !== undefined) {
        // successful result
        break;
      }
    }
    
    if (!sticky || resultJSON !== undefined) {
      latestJson = resultJSON;
    }

    panel.webview.html = getWebviewContent(latestJson, searchKeyword, searchInputFocused, searchInputSelectionStart, searchInputSelectionEnd);
}

function tryJSONParse(textfragment) {
  var done = false;
  for (const preproc of JSON_PREPROCESSORS) {
      try {
        const jsonObject = JSON.parse(preproc(textfragment));
        return JSON.stringify(jsonObject, null, 2);
        
      } catch { /* ignore */ }
    }
  }
  return undefined;
}

function createWebviewPanel(context) {
  showBMC = (Math.random() < 0.6);

  let newPanel = vscode.window.createWebviewPanel(
    'prettyJsonPreview',
    'Pretty JSON Preview',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true
    }
  );

  newPanel.onDidDispose(
    () => {
      panel = undefined;
    },
    null,
    context.subscriptions
  );

  newPanel.webview.onDidReceiveMessage(
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
        case 'stickyChanged':
          sticky = message.sticky;
          context.globalState.update(GLOBAL_STATE_STICKY_TOGGLE, sticky);
          break;
        case 'smartChanged':
          smart = message.smart;
          context.globalState.update(GLOBAL_STATE_SMART_TOGGLE, smart);
          break;
        case 'logMessage':
          defaultLogger.log(message.text);
          break;
        case 'searchKeyword':
          updatePrettifiedJSON(context, message.keyword, true, message.selectionStart, message.selectionEnd);
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  return newPanel;
}

function getWebviewContent(content, searchKeyword = '', searchInputFocused, searchInputSelectionStart = 0, searchInputSelectionEnd = 0) {
  if (!content) {  // if selection is not a JSON
    if (!!latestJson) {  // if there was a sticky content
      content = latestJson;
    }
    else {
      content = '';
    }
  }
  let bmc = `<!-- https://buymeacoffee.com/applerk -->`
  if (showBMC) {
    bmc = `<script data-name="BMC-Widget" data-cfasync="false" src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js"
        data-id="applerk" data-description="Support me on Buy me a coffee!" data-message="" data-color="#FF813F" data-position="Right"
        data-x_margin="18" data-y_margin="18"></script>`;
  }
  const themeHtml = getThemesHtml();
  return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pretty JSON Preview</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${theme}.min.css">
      <style>
        .hljs, .hljs code { background: transparent !important; }
        .hljs { counter-reset: line; }
        .line-number { counter-increment: line; width: 2em; display: inline-block; text-align: right;
          padding-right: 0.5em; margin-right: 0.5em; color: rgba(128, 128, 128, 0.5); border-right: 1px solid rgba(128, 128, 128, 0.4); }
        .toolbar { padding: 5px; background-color: rgba(128, 128, 128, 0.2); backdrop-filter: blur(5px); }
        .button { padding-right: 10px; padding-left: 10px; }
        .unselectable, #bmc-wbtn { -webkit-user-select: none; user-select: none; }
        pre { padding: 0; margin: 0; }
        .highlight-match { background-color: yellow; }
        #search-input { padding: 1px 2px; margin-left: 10px; width: 120px; font-size: 1em; }
      </style>
    </head>
    <body>
      <div class="toolbar unselectable">
        <label class='button'><input type="checkbox" id="wrap-toggle" /> Wrap</label>
        <label class='button'><input type="checkbox" id="sticky-toggle" /> Sticky</label>
        <label class='button'><input type="checkbox" id="smart-toggle" /> Smart</label>
        <label class='button'>Theme <select id="theme-select">
          ${themeHtml}
        </select></label>
        <input type="text" id="search-input" placeholder="Find..." value="${searchKeyword}">
      </div>
      <pre><code id="json-code" class=hljs>${highlightJson(content, searchKeyword)}</code></pre>
      <script>
        const vscode = acquireVsCodeApi();
        const codeElement = document.getElementById('json-code');
        const wrapToggle = document.getElementById('wrap-toggle');
        const stickyToggle = document.getElementById('sticky-toggle');
        const smartToggle = document.getElementById('smart-toggle');
        const themeSelect = document.getElementById('theme-select');
        const searchInput = document.getElementById('search-input');

        wrapToggle.addEventListener('change', (e) => {
          codeElement.style.whiteSpace = e.target.checked ? 'pre-wrap' : 'pre';
          vscode.postMessage({
            command: 'wrapChanged',
            wrap: e.target.checked
          });
        });

        stickyToggle.addEventListener('change', (e) => {
          vscode.postMessage({
            command: 'stickyChanged',
            sticky: e.target.checked
          });
        });

        smartToggle.addEventListener('change', (e) => {
          vscode.postMessage({
            command: 'smartChanged',
            smart: e.target.checked
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

        function debounce(func, wait) {
          let timeout;
          return function executedFunction(...args) {
            const later = () => {
              clearTimeout(timeout);
              func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
          };
        }

        searchInput.addEventListener('input', debounce((e) => {
          vscode.postMessage({
            command: 'searchKeyword',
            keyword: e.target.value,
            selectionStart: e.target.selectionStart,
            selectionEnd: e.target.selectionEnd
          });
        }, 300));

        // Restore focus to search input after DOM update
        if (${searchInputFocused}) {
          setTimeout(() => {
            const input = document.getElementById('search-input');
            if (input) {
              input.focus();
              input.setSelectionRange(${searchInputSelectionStart}, ${searchInputSelectionEnd});
            }
          }, 0);
        }

        document.addEventListener('keydown', (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
            e.preventDefault();
            const input = document.getElementById('search-input');
            if (input) {
              const isFocused = document.activeElement === input;
              input.focus();
              if (!isFocused) {
                input.select();
              } else {
                input.setSelectionRange(input.value.length, input.value.length);
              }
            }
          } else if (e.key === 'Escape') {
            const input = document.getElementById('search-input');
            if (input) {
              input.value = '';
              input.blur();
              vscode.postMessage({
                command: 'searchKeyword',
                keyword: '',
                selectionStart: 0,
                selectionEnd: 0
              });
            }
          }
        });

        // initial theme
        themeSelect.value = '${theme}';
        wrapToggle.checked = ${wrap};
        stickyToggle.checked = ${sticky};
        smartToggle.checked = ${smart};
        codeElement.style.whiteSpace = "${wrap ? 'pre-wrap' : 'pre'}";
      </script>

      ${bmc}
    </body>
    </html>`;
}

function highlightJson(code, searchKeyword = '') {
  const regex = searchKeyword ? new RegExp(`(${searchKeyword.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi') : null;
  const highlightedCode = hljs.highlight(code, { language: 'json' }).value;
  const lines = highlightedCode.split('\n');
  return lines.map((line, index) => {
    if (!searchKeyword || !regex) {
      return `<span class="line-number unselectable">${index + 1}</span>${line}`;
    }

    const parts = [];
    let current = '';
    let inTag = false;
    let tagContent = '';

    // Iterates through each character in the line to distinguish HTML tags from
    // regular content. This loop builds an array of parts, where each part is
    // either an HTML tag (enclosed in <>) or non-tag content. It tracks whether
    // it's inside a tag using the inTag flag, accumulating tag content in
    // tagContent and non-tag content in current. The resulting parts array
    // allows safe application of search highlighting only to non-tag content,
    // preserving HTML syntax.
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '<' && !inTag) {
        if (current) parts.push({ text: current, isTag: false });
        current = '';
        inTag = true;
        tagContent = '<';
      } else if (line[i] === '>' && inTag) {
        tagContent += '>';
        parts.push({ text: tagContent, isTag: true });
        inTag = false;
        tagContent = '';
      } else if (inTag) {
        tagContent += line[i];
      } else {
        current += line[i];
      }
    }
    if (current) parts.push({ text: current, isTag: false });
    if (tagContent) parts.push({ text: tagContent, isTag: inTag });

    // Highlight search keyword in non-tag parts only
    const processedParts = parts.map(part => {
      if (part.isTag) {
        return part.text;
      }
      return part.text.replace(regex, '<span class="highlight-match">$1</span>');
    });

    const modifiedLine = processedParts.join('');
    return `<span class="line-number unselectable">${index + 1}</span>${modifiedLine}`;
  }).join('\n');
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

function getThemes(logger = defaultLogger) {
  let themesFile;
  try {
    themesFile = path.join(__dirname, '..', 'dist', 'themes.json');
    const themes = JSON.parse(fs.readFileSync(themesFile, 'utf8'));
    return themes; // Already sorted during build
  } catch (err) {
    logger.error(`Error reading themes file ${themesFile}`, err);
    return [];
  }
}

module.exports = {
  activate,
  deactivate,
  getThemes,  // for testing
  highlightJson,  // for testing
}
