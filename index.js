const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = 15787; // Port untuk server

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Route untuk menjalankan perintah di VPS
app.post('/execute', (req, res) => {
    const { command } = req.body;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ output: stderr || error.message });
        }
        res.json({ output: stdout });
    });
});

// Halaman utama
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Akses VPS</title>
            <style>
                body {
                    font-family: 'Courier New', Courier, monospace;
                    background-color: #1e1e1e; /* Latar belakang terminal */
                    color: #ffffff; /* Warna teks */
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 800px;
                    margin: auto;
                    background: #000000; /* Latar belakang untuk konten */
                    padding: 20px;
                    border-radius: 5px;
                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
                    overflow: hidden; /* Mencegah overflow */
                }
                h1 {
                    text-align: center;
                    color: #00ff00; /* Warna hijau untuk judul */
                }
                #command {
                    width: 100%;
                    padding: 10px;
                    background: #333333; /* Latar belakang input */
                    color: #ffffff; /* Warna teks input */
                    border: 1px solid #555555;
                    border-radius: 3px;
                    outline: none; /* Menghilangkan outline default */
                }
                #command:focus {
                    border: 1px solid #00ff00; /* Efek fokus */
                }
                button {
                    padding: 10px;
                    background: #007bff;
                    color: white;
                    border: none;
                    cursor: pointer;
                    margin-top: 10px;
                    width: 100%; /* Tombol memenuhi lebar */
                }
                button:hover {
                    background: #0056b3; /* Efek hover */
                }
                pre {
                    background: #000000; /* Latar belakang untuk output */
                    padding: 10px;
                    border-radius: 5px;
                    overflow: auto; /* Mengizinkan scrollbar */
                    white-space: pre-wrap; /* Membungkus teks panjang */
                    word-wrap: break-word; /* Memecah kata yang terlalu panjang */
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Akses VPS</h1>
                <input type="text" id="command" placeholder="Masukkan perintah" autofocus required>
                <button id="execute">Eksekusi</button>
                <pre id="output"></pre>
            </div>
            <script>
                document.getElementById('execute').addEventListener('click', function() {
                    const command = document.getElementById('command').value;

                    fetch('/execute', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ command }),
                    })
                    .then(response => response.json())
                    .then(data => {
                        const output = data.output || '';
                        document.getElementById('output').textContent += output + '\\n'; // Menambahkan output
                        document.getElementById('command').value = ''; // Mengosongkan input setelah eksekusi
                    })
                    .catch(error => {
                        document.getElementById('output').textContent += error.message + '\\n';
                    });
                });

                // Menjalankan perintah dengan enter
                document.getElementById('command').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        document.getElementById('execute').click();
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// Jalankan server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
