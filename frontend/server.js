const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') { 
    res.writeHead(200); 
    res.end(); 
    return; 
  }
  
  let filePath = '.' + req.url;
  if (filePath === './') filePath = './index.html';
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        fs.readFile('./index.html', (err, content) => {
          if (err) { 
            res.writeHead(500); 
            res.end('Server Error'); 
          } else { 
            res.writeHead(200, { 'Content-Type': 'text/html' }); 
            res.end(content, 'utf-8'); 
          }
        });
      } else { 
        res.writeHead(500); 
        res.end('Server Error: ' + error.code); 
      }
    } else { 
      res.writeHead(200, { 'Content-Type': contentType }); 
      res.end(content, 'utf-8'); 
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
========================================
  Browser Platform Frontend
========================================
  Server running at: http://127.0.0.1:${PORT}
  Make sure backend is running on port 3001
========================================
  `);
});
