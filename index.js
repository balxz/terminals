 const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// File management API routes
app.get('/api/files', async (req, res) => {
  try {
    const dirPath = path.resolve(req.query.path || process.env.HOME);
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const fileList = files.map(file => ({
      name: file.name,
      isDirectory: file.isDirectory(),
      path: path.join(dirPath, file.name)
    }));
    res.json(fileList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/file', async (req, res) => {
  try {
    const filePath = path.resolve(req.query.path);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/file', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    const resolvedPath = path.resolve(filePath);
    await fs.writeFile(resolvedPath, content, 'utf-8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket handling for terminal
wss.on('connection', (ws) => {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
  });

  ptyProcess.on('data', (data) => {
    ws.send(JSON.stringify({ type: 'terminal', data }));
  });

  ws.on('message', (message) => {
    const { type, data } = JSON.parse(message);
    if (type === 'terminal') {
      ptyProcess.write(data);
    } else if (type === 'resize') {
      ptyProcess.resize(data.cols, data.rows);
    }
  });

  ws.on('close', () => {
    ptyProcess.kill();
  });
});

// HTML route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BEXNXX</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@4.19.0/css/xterm.css" />
        <script src="https://cdn.jsdelivr.net/npm/xterm@4.19.0/lib/xterm.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.5.0/lib/xterm-addon-fit.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
        <style>
            body, html {
                height: 100%;
                margin: 0;
                padding: 0;
                background-color: #1a202c;
                color: #e2e8f0;
            }
            #terminal {
                height: 100%;
            }
            .file-list {
                max-height: calc(100vh - 12rem);
                overflow-y: auto;
            }
            .xterm {
                padding: 10px;
            }
        </style>
    </head>
    <body class="flex flex-col h-full">
        <nav class="bg-gray-800 p-4 shadow-md">
            <h1 class="text-2xl font-bold text-center sm:text-left">BEXNXX</h1>
        </nav>
        <div class="flex-grow flex flex-col sm:flex-row overflow-hidden">
            <div class="w-full sm:w-1/4 p-4 bg-gray-700 overflow-y-auto">
                <h2 class="text-xl mb-2">File Explorer</h2>
                <div id="file-list" class="file-list"></div>
            </div>
            <div class="w-full sm:w-3/4 p-4 flex flex-col">
                <div id="terminal" class="flex-grow mb-4 rounded bg-black"></div>
                <div id="file-editor" class="hidden flex-grow flex flex-col">
                    <textarea id="file-content" class="w-full flex-grow p-2 bg-gray-800 text-white rounded resize-none"></textarea>
                    <div class="flex justify-between mt-2">
                        <button id="close-editor" class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">Close</button>
                        <button id="save-file" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Save</button>
                    </div>
                </div>
            </div>
        </div>
        <script>
            const term = new Terminal({
                fontSize: 14,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                theme: {
                    background: '#1a1b26',
                    foreground: '#a9b1d6'
                }
            });
            const fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);
            term.open(document.getElementById('terminal'));
            fitAddon.fit();

            const socket = new WebSocket('ws://' + window.location.host);

            socket.onopen = () => {
                term.write('Connected to the server\\r\\n');
            };

            socket.onmessage = (event) => {
                const { type, data } = JSON.parse(event.data);
                if (type === 'terminal') {
                    term.write(data);
                }
            };

            term.onData((data) => {
                socket.send(JSON.stringify({ type: 'terminal', data }));
            });

            socket.onclose = () => {
                term.write('\\r\\nDisconnected from the server');
            };

            window.addEventListener('resize', () => {
                fitAddon.fit();
                socket.send(JSON.stringify({ 
                    type: 'resize', 
                    data: { cols: term.cols, rows: term.rows }
                }));
            });

            // File management
            const fileList = document.getElementById('file-list');
            const fileEditor = document.getElementById('file-editor');
            const fileContent = document.getElementById('file-content');
            const saveFileBtn = document.getElementById('save-file');
            const closeEditorBtn = document.getElementById('close-editor');
            const terminal = document.getElementById('terminal');

            let currentPath = '';

            async function loadFiles(path = '') {
                currentPath = path;
                const response = await fetch(\`/api/files?path=\${path}\`);
                const files = await response.json();
                fileList.innerHTML = \`
                    <div class="flex items-center cursor-pointer hover:bg-gray-600 p-1 rounded" onclick="loadFiles('')">
                        <span class="mr-2">🏠</span>
                        Home
                    </div>
                    \${path ? \`
                    <div class="flex items-center cursor-pointer hover:bg-gray-600 p-1 rounded" onclick="loadFiles(\'\${path.split('/').slice(0, -1).join('/')}\')">
                        <span class="mr-2">⬆️</span>
                        ..
                    </div>
                    \` : ''}
                    \${files.map(file => \`
                    <div class="flex items-center cursor-pointer hover:bg-gray-600 p-1 rounded" onclick="handleFileClick(\'\${file.path}', \${file.isDirectory})">
                        <span class="mr-2">\${file.isDirectory ? '📁' : '📄'}</span>
                        \${file.name}
                    </div>
                \`).join('')}\`;
            }

            async function handleFileClick(path, isDirectory) {
                if (isDirectory) {
                    loadFiles(path);
                } else {
                    const response = await fetch(\`/api/file?path=\${path}\`);
                    const { content } = await response.json();
                    fileContent.value = content;
                    fileEditor.classList.remove('hidden');
                    terminal.classList.add('hidden');
                    saveFileBtn.onclick = () => saveFile(path);
                }
            }

            async function saveFile(path) {
                const content = fileContent.value;
                try {
                    await fetch('/api/file', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path, content })
                    });
                    alert('File saved successfully!');
                } catch (error) {
                    alert('Error saving file: ' + error.message);
                }
            }

            closeEditorBtn.onclick = () => {
                fileEditor.classList.add('hidden');
                terminal.classList.remove('hidden');
                fitAddon.fit();
            };

            loadFiles();
        </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 15787;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
