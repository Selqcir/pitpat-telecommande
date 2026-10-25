// server.js - Serveur statique minimal pour héberger la télécommande PitPat
//
// Usage :
//   node server.js                              -> HTTP sur le port 8080
//   PORT=3000 node server.js                    -> autre port
//   TLS_CERT=cert.pem TLS_KEY=key.pem node server.js  -> HTTPS
//   (HTTPS aussi automatiquement si cert.pem et key.pem sont dans ce dossier)
//
// Web Bluetooth n'est disponible que sur HTTPS ou sur http://localhost.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

// Seuls les fichiers de l'application sont servis (pas server.js, .git, etc.)
const ALLOWED_FILES = new Set([
    'index.html', 'treadmill.js', 'programs.js',
    'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
    'status-disconnected.png', 'status-off.png', 'status-on.png'
]);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png'
};

function handleRequest(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Allow': 'GET, HEAD' });
        return res.end();
    }

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
        res.writeHead(400);
        return res.end('Requête invalide');
    }
    const fileName = pathname === '/' ? 'index.html' : pathname.slice(1);

    if (!ALLOWED_FILES.has(fileName)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Introuvable');
    }

    const filePath = path.join(ROOT, fileName);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Erreur serveur');
        }
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[path.extname(fileName)] || 'application/octet-stream',
            'Content-Length': data.length,
            'Cache-Control': 'no-cache'
        });
        res.end(req.method === 'HEAD' ? undefined : data);
    });
    console.log(`${new Date().toISOString()} ${req.method} ${pathname}`);
}

function localAddresses() {
    const addresses = [];
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const addr of iface || []) {
            if (addr.family === 'IPv4' && !addr.internal) addresses.push(addr.address);
        }
    }
    return addresses;
}

// HTTPS if a certificate is given, or if cert.pem / key.pem sit next to server.js
const certFile = process.env.TLS_CERT || path.join(ROOT, 'cert.pem');
const keyFile = process.env.TLS_KEY || path.join(ROOT, 'key.pem');

let server;
let protocol = 'http';
if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    server = https.createServer({
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile)
    }, handleRequest);
    protocol = 'https';
} else {
    server = http.createServer(handleRequest);
}

server.listen(PORT, HOST, () => {
    console.log(`Télécommande PitPat disponible sur :`);
    console.log(`  ${protocol}://localhost:${PORT}`);
    for (const ip of localAddresses()) {
        console.log(`  ${protocol}://${ip}:${PORT}`);
    }
    if (protocol === 'http') {
        console.log('\nAttention : en HTTP, le Bluetooth ne fonctionne que via localhost.');
        console.log('Pour y accéder depuis un téléphone, utilisez HTTPS (voir README).');
    }
});
