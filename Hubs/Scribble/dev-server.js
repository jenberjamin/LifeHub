/* ═══════════════════════════════════════════════════
   SCRIBBLE — LOCAL SERVER
   dev-server.js   (run it with Start-Scribble.bat)

   Scribble cannot run from a double-clicked file.
   Opening Scribble.html straight off the disk gives you
   a file:// page, and browsers switch three things off
   there that Scribble depends on:

     • ES modules      — every js/*-firebase.js is a
                         module and fails CORS on file://
     • service workers — the whole offline shell
     • crypto.subtle   — the gate's password hashing

   Serving the folder over http://localhost fixes all
   three at once, because localhost counts as a secure
   context even without https.

   Zero dependencies on purpose: no npm install, nothing
   to go stale, just the Node you already have.
═══════════════════════════════════════════════════ */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8080;

/* ── SHARED ASSETS ────────────────────────────────
   One deliberate door out of ROOT.

   LifeHub keeps faces every hub uses in
   LifeHub 2.0/CSS/fonts/ — one copy, so changing the
   wordmark changes it everywhere rather than in nine
   places. Scribble is served from its own folder, which
   is two levels below that, and the guard further down
   refuses ../ on purpose.

   So instead of widening ROOT (which would change every
   URL and the service worker's scope), one prefix is
   mapped to one folder, read-only, with the same
   containment check applied inside it. Anything outside
   ALIASES is still refused exactly as before.

   ── WHY THE PREFIX IS '/CSS/' ─────────────────────
   Scribble is opened two ways: this server (root = this
   folder) and VS Code's Live Server (root = LifeHub
   2.0, port 5502 per .vscode/settings.json). On Live
   Server the shared folder is already reachable at
   /CSS/. Naming the alias to match means ONE url works
   under both servers, so the stylesheets need only one
   src and neither setup logs a 404 for the other's
   path.

   Case matters: this is compared exactly, so Scribble's
   own lowercase /css/ requests never land here.

   Add a prefix here if another shared folder is needed;
   do not be tempted to point one at the LifeHub root. */
const ALIASES = {
    '/CSS/': path.resolve(ROOT, '..', '..', 'CSS')
};

/* Correct types matter more than usual here: a browser
   refuses to run a module served as text/plain, and the
   service worker refuses to register unless sw.js comes
   back as JavaScript. */
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.mjs':  'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    /* Chrome silently ignores a manifest served as anything else,
       so the install prompt never appears and nothing says why. */
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.txt':  'text/plain; charset=utf-8',
    '.map':  'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
    let urlPath;
    try {
        urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (e) {
        res.writeHead(400); res.end('Bad request'); return;
    }

    if (urlPath === '/') urlPath = '/Scribble.html';

    /* Resolve, then confirm the result is still inside ROOT.
       Without this check a request for ../../ walks straight
       out of the folder and serves the rest of the disk.

       Compared with path.relative rather than startsWith:
       a plain prefix test on the string would also accept a
       SIBLING folder, since "...\Scribble-other" starts with
       "...\Scribble". */
    /* An aliased prefix resolves against its own base, and is
       contained within it by the same test — so /shared/../../
       cannot climb out any more than /../ can. */
    let base = ROOT;
    let rest = urlPath;
    for (const prefix in ALIASES) {
        if (urlPath.startsWith(prefix)) {
            base = ALIASES[prefix];
            rest = urlPath.slice(prefix.length - 1);   // keep the leading /
            break;
        }
    }

    const filePath = path.resolve(base, '.' + path.sep + rest);
    const rel      = path.relative(base, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>404</h1><p>' + urlPath + ' is not in this folder.</p>' +
                    '<p><a href="/Scribble.html">Scribble</a> &middot; ' +
                    '<a href="/Scribble-gate.html">Gate</a> &middot; ' +
                    '<a href="/Scribble-setup.html">Setup</a></p>');
            return;
        }

        const headers = {
            'Content-Type': TYPES[path.extname(filePath).toLowerCase()] ||
                            'application/octet-stream',
            /* no-store, so the browser cache never masks an edit.
               The service worker is the only cache that should be
               in play — otherwise you get two layers of stale and
               no way to tell which one is lying to you. */
            'Cache-Control': 'no-store'
        };

        /* Lets the worker control the whole folder even though it
           is served from the root of it. Harmless here, and saves
           a confusing scope error if sw.js ever moves. */
        if (path.basename(filePath) === 'sw.js') {
            headers['Service-Worker-Allowed'] = '/';
        }

        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error('\n  Port ' + PORT + ' is already in use.');
        console.error('  Either Scribble is already running, or something else has it.');
        console.error('  Try a different port:   Start-Scribble.bat 8081\n');
    } else {
        console.error('\n  Server error: ' + err.message + '\n');
    }
    process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
    const base = 'http://localhost:' + PORT;
    console.log('');
    console.log('  Scribble is served at ' + base);
    console.log('');
    console.log('    Workshop   ' + base + '/Scribble.html');
    console.log('    Gate       ' + base + '/Scribble-gate.html');
    console.log('    Setup      ' + base + '/Scribble-setup.html');
    console.log('');
    console.log('  localhost counts as a secure context, so service workers');
    console.log('  and crypto.subtle both work here.');
    console.log('');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
});
