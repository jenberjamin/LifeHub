/* ═══════════════════════════════════════════════════
   SCRIBBLE — ICON GENERATOR
   make-icons.js        run:  node make-icons.js

   Writes the PWA icons into icons/. You only need to run
   this again if you want to recolour or redraw them —
   the PNGs it produces are committed, so a normal deploy
   never touches this file. Safe to delete if you'd
   rather manage the icons by hand.

   Zero dependencies: Node's own zlib does the compression
   and the PNG chunks are assembled here. That keeps the
   repo free of an image toolchain for four small files.

   The drawing is deliberately all rectangles and circles
   — a notebook page with ruled lines on the brand
   colour. It has to stay legible at 48px on a home
   screen, which rules out anything fussy.
═══════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

/* Brand palette, lifted from css/scribble.css */
const INK   = [0x5C, 0x5C, 0x52];   // --accent
const PAPER = [0xF6, 0xF5, 0xF2];   // --main-bg
const RULE  = [0xC9, 0xC6, 0xBF];   // muted line
const SPINE = [0xB0, 0x8A, 0x5C];   // warm accent

/* ── PNG encoding ──────────────────────────────── */
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const len  = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc  = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
    const sig  = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8]  = 8;   // bit depth
    ihdr[9]  = 6;   // colour type: RGBA
    ihdr[10] = 0;   // deflate
    ihdr[11] = 0;   // adaptive filtering
    ihdr[12] = 0;   // no interlace

    /* Each scanline is prefixed with its filter byte (0 = none). */
    const raw = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) {
        const rowStart = y * (width * 4 + 1);
        raw[rowStart] = 0;
        rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
    }

    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

/* ── Tiny drawing surface ──────────────────────── */
function Canvas(size) {
    this.size = size;
    this.buf  = Buffer.alloc(size * size * 4);   // transparent
}

/* Alpha-blends a colour onto one pixel. `a` is 0..1 and is what
   gives the rounded corners a smooth edge instead of a staircase. */
Canvas.prototype.px = function (x, y, colour, a) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    if (a <= 0) return;
    if (a > 1) a = 1;

    const i  = (y * this.size + x) * 4;
    const dA = this.buf[i + 3] / 255;
    const oA = a + dA * (1 - a);
    if (oA <= 0) return;

    for (let c = 0; c < 3; c++) {
        this.buf[i + c] = Math.round(
            (colour[c] * a + this.buf[i + c] * dA * (1 - a)) / oA
        );
    }
    this.buf[i + 3] = Math.round(oA * 255);
};

/*
 * Rounded rectangle, anti-aliased by sampling how far each pixel sits
 * from the shape's edge. Sub-pixel coverage is approximated from that
 * distance, which is plenty at these sizes and avoids supersampling
 * the whole canvas.
 */
Canvas.prototype.roundRect = function (x0, y0, x1, y1, r, colour) {
    const from = Math.max(0, Math.floor(y0)), to = Math.min(this.size, Math.ceil(y1));
    for (let y = from; y < to; y++) {
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.size, Math.ceil(x1)); x++) {
            const cx = x + 0.5, cy = y + 0.5;

            /* Distance outside the rectangle shrunk by the corner radius. */
            const dx = Math.max(x0 + r - cx, 0, cx - (x1 - r));
            const dy = Math.max(y0 + r - cy, 0, cy - (y1 - r));
            const d  = Math.sqrt(dx * dx + dy * dy);

            this.px(x, y, colour, r - d + 0.5);
        }
    }
};

/* ── The icon itself ───────────────────────────── */
/*
 * inset is the fraction of the canvas left empty around the artwork.
 * 0 for a normal icon; ~0.10 for the maskable one, whose corners a
 * launcher is free to crop into a circle or a squircle.
 */
function drawIcon(size, inset) {
    const c = new Canvas(size);
    const S = size;
    const pad = S * inset;
    const box = S - pad * 2;

    /* Background tile */
    c.roundRect(pad, pad, pad + box, pad + box, box * 0.22, INK);

    /* Page */
    const px0 = pad + box * 0.20, px1 = pad + box * 0.80;
    const py0 = pad + box * 0.17, py1 = pad + box * 0.83;
    c.roundRect(px0, py0, px1, py1, box * 0.045, PAPER);

    /* Spine down the left edge of the page */
    c.roundRect(px0 + box * 0.055, py0 + box * 0.05,
                px0 + box * 0.085, py1 - box * 0.05,
                box * 0.015, SPINE);

    /* Ruled lines. The last is short, so it reads as written-on
       rather than as a barcode. */
    const lx0  = px0 + box * 0.145;
    const lx1  = px1 - box * 0.075;
    const top  = py0 + box * 0.135;
    const gap  = box * 0.115;
    const thick = Math.max(1, box * 0.032);

    for (let i = 0; i < 4; i++) {
        const y = top + gap * i;
        const right = (i === 3) ? lx0 + (lx1 - lx0) * 0.55 : lx1;
        c.roundRect(lx0, y, right, y + thick, thick / 2, RULE);
    }

    return encodePNG(S, S, c.buf);
}

/* ── Write them out ────────────────────────────── */
const outDir = path.join(__dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });

const jobs = [
    ['scribble-192.png',           192, 0],
    ['scribble-512.png',           512, 0],
    ['scribble-maskable-512.png',  512, 0.10],
    ['apple-touch-icon.png',       180, 0],
    ['favicon-32.png',              32, 0]
];

for (const [name, size, inset] of jobs) {
    const file = path.join(outDir, name);
    fs.writeFileSync(file, drawIcon(size, inset));
    console.log('  wrote icons/' + name + '  (' + size + 'x' + size + ')');
}
console.log('\n  Done.');
