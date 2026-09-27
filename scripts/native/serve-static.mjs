#!/usr/bin/env node
// Minimal static server for native/ (the S5 typography reference page and the
// font files it loads). Usage: node scripts/native/serve-static.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../native/', import.meta.url));
const port = Number(process.argv[2] ?? 4180);
const types = { '.html': 'text/html; charset=utf-8', '.ttf': 'font/ttf', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`native/ on http://localhost:${port}`));
