import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { isPublicAddress } from './ip';
import { IMAGE_MAX_BYTES, PAGE_MAX_BYTES, USER_AGENT, SafeFetchError, createSafeFetch, safeFetch, type SafeFetchFailure } from './safeFetch';

// The fetcher against real HTTP servers on this machine. Loopback is refused
// by default (that is the point), so the tests that need to reach a server
// give the fetcher a policy that trusts 127.0.0.1 and a made-up DNS — the same
// code path, with the one decision swapped.

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((done) => {
          s.closeAllConnections();
          s.close(() => done());
        }),
    ),
  );
});

interface Local {
  port: number;
  hits: { url: string; headers: http.IncomingHttpHeaders }[];
}

async function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse, local: Local) => void): Promise<Local> {
  const local: Local = { port: 0, hits: [] };
  const server = http.createServer((req, res) => {
    local.hits.push({ url: req.url ?? '', headers: req.headers });
    handler(req, res, local);
  });
  servers.push(server);
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  local.port = (server.address() as AddressInfo).port;
  return local;
}

const NAMES: Record<string, string[]> = {
  'site.test': ['127.0.0.1'],
  'other.test': ['127.0.0.1'],
  'inside.test': ['10.0.0.5'],
  'metadata.test': ['169.254.169.254'],
  'mixed.test': ['127.0.0.1', '10.0.0.5'],
  'six.test': ['::1'],
  'empty.test': [],
};

/** A fetcher that trusts loopback and resolves the names above; `calls` lists the names it was asked for. */
function trusting() {
  const calls: string[] = [];
  const fetcher = createSafeFetch({
    async resolve(host) {
      calls.push(host);
      if (!(host in NAMES)) throw new Error('ENOTFOUND');
      return NAMES[host];
    },
    allowAddress: (ip) => ip === '127.0.0.1' || isPublicAddress(ip),
    allowAnyPort: true,
  });
  return { fetcher, calls };
}

async function failure(p: Promise<unknown>): Promise<SafeFetchFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(SafeFetchError);
  return (e as SafeFetchError).reason;
}

const html = (head: string) => `<!doctype html><html><head>${head}</head><body>hi</body></html>`;
const page = (res: http.ServerResponse, body = html('<title>Hello</title>'), type = 'text/html; charset=utf-8') => {
  res.writeHead(200, { 'Content-Type': type });
  res.end(body);
};

describe('addresses it will not connect to', () => {
  it('refuses a server on this machine by default, without a single request reaching it', async () => {
    const local = await serve((_req, res) => page(res));
    const fetcher = createSafeFetch({ allowAnyPort: true });
    for (const host of ['127.0.0.1', '127.1', '0x7f.1', '2130706433', '0177.0.0.1', '017700000001', '[::ffff:127.0.0.1]', '１２７.０.０.１']) {
      const reason = await failure(fetcher(`http://${host}:${local.port}/`, { mode: 'page' }));
      expect(['blocked', 'bad_url'], host).toContain(reason);
    }
    expect(await failure(fetcher(`http://127.0.0.1:${local.port}/`, { mode: 'page' }))).toBe('blocked');
    expect(await failure(fetcher(`http://2130706433:${local.port}/`, { mode: 'page' }))).toBe('blocked');
    expect(await failure(fetcher(`http://0x7f.1:${local.port}/`, { mode: 'image' }))).toBe('blocked');
    expect(local.hits).toHaveLength(0);
  });

  it('refuses private, link-local and metadata addresses written in the URL', async () => {
    const fetcher = createSafeFetch({ allowAnyPort: true });
    for (const address of ['10.0.0.1', '172.16.5.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1']) {
      expect(await failure(fetcher(`http://${address}/latest/meta-data/`, { mode: 'page' })), address).toBe('blocked');
    }
    // IPv6 literals have no dot, so the link rules refuse them before the address is even looked at.
    for (const address of ['[::1]', '[fd00::1]', '[fe80::1]', '[::ffff:a9fe:a9fe]', '[64:ff9b::a00:1]']) {
      expect(await failure(fetcher(`http://${address}/`, { mode: 'page' })), address).toBe('bad_url');
    }
  });

  it('refuses names that mean "inside" without asking DNS', async () => {
    const calls: string[] = [];
    const fetcher = createSafeFetch({
      async resolve(host) {
        calls.push(host);
        return ['93.184.216.34'];
      },
      allowAnyPort: true,
    });
    for (const host of ['a.localhost', 'printer.local', 'metadata.google.internal', 'x.corp', 'a.localhost.']) {
      expect(await failure(fetcher(`http://${host}/`, { mode: 'page' })), host).toBe('blocked');
    }
    // `localhost.` and `localhost` have no dot to make a name of: the link rules turn them away first.
    expect(await failure(fetcher('http://localhost./', { mode: 'page' }))).toBe('bad_url');
    expect(calls).toEqual([]);
  });

  it('refuses a name whose answer is private, and one with ANY private address among its answers', async () => {
    const local = await serve((_req, res) => page(res));
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://inside.test:${local.port}/`, { mode: 'page' }))).toBe('blocked');
    expect(await failure(fetcher(`http://metadata.test:${local.port}/`, { mode: 'page' }))).toBe('blocked');
    expect(await failure(fetcher(`http://mixed.test:${local.port}/`, { mode: 'page' }))).toBe('blocked');
    expect(local.hits).toHaveLength(0);
  });

  it('reports a name that does not resolve, or resolves to nothing, as a DNS failure', async () => {
    const { fetcher } = trusting();
    expect(await failure(fetcher('http://nowhere.test/', { mode: 'page' }))).toBe('dns');
    expect(await failure(fetcher('http://empty.test/', { mode: 'page' }))).toBe('dns');
  });

  it('is cut off by the deadline while a name will not resolve', async () => {
    const fetcher = createSafeFetch({ resolve: () => new Promise(() => {}), allowAnyPort: true });
    const started = Date.now();
    expect(await failure(fetcher('http://stuck.test/', { mode: 'page', timeoutMs: 150 }))).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('refuses links the link rules refuse: other schemes, user names, odd ports, bare names', async () => {
    for (const link of ['ftp://a.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'http://user@a.com/', 'http://a.com:8080/', 'http://intranet/', 'not a url', '']) {
      expect(await failure(safeFetch(link, { mode: 'page' })), link).toBe('bad_url');
    }
    // The real fetcher takes no port but 80 and 443: a local test server on a random one is not reachable through it.
    const local = await serve((_req, res) => page(res));
    expect(await failure(safeFetch(`http://127.0.0.1:${local.port}/`, { mode: 'page' }))).toBe('bad_url');
    expect(local.hits).toHaveLength(0);
  });
});

describe('DNS rebinding', () => {
  it('connects to the address it vetted, and asks DNS once per hop', async () => {
    const local = await serve((_req, res) => page(res));
    const calls: string[] = [];
    const fetcher = createSafeFetch({
      // First answer: loopback (trusted by this test's policy). Any later answer would be a private address.
      async resolve(host) {
        calls.push(host);
        return calls.length === 1 ? ['127.0.0.1'] : ['10.0.0.5'];
      },
      allowAddress: (ip) => ip === '127.0.0.1',
      allowAnyPort: true,
    });
    // `pinned.test` exists in no DNS: reaching the server proves the connection used the vetted address, not a lookup of its own.
    const result = await fetcher(`http://pinned.test:${local.port}/`, { mode: 'page' });
    expect(result.status).toBe(200);
    expect(calls).toEqual(['pinned.test']);
    expect(local.hits[0].headers.host).toBe(`pinned.test:${local.port}`);
  });

  it('falls back along the vetted addresses when the first does not answer (an IPv6 address on a host with no IPv6)', async () => {
    const local = await serve((_req, res) => page(res));
    const fetcher = createSafeFetch({
      // Nothing listens on [::1] at this port: the connection to it fails and the next vetted address is tried.
      resolve: async () => ['::1', '127.0.0.1'],
      allowAddress: (ip) => ip === '127.0.0.1' || ip === '::1',
      allowAnyPort: true,
    });
    const result = await fetcher(`http://dual.test:${local.port}/`, { mode: 'page' });
    expect(result.status).toBe(200);
    expect(local.hits).toHaveLength(1);
  });

  it('vets every hop of a redirect again', async () => {
    const local = await serve((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { Location: `http://rebound.test:${local.port}/final` });
        res.end();
      } else page(res);
    });
    const calls: string[] = [];
    const fetcher = createSafeFetch({
      async resolve(host) {
        calls.push(host);
        // The same name that was fine for the first hop turns private for the second.
        return host === 'first.test' ? ['127.0.0.1'] : ['10.0.0.5'];
      },
      allowAddress: (ip) => ip === '127.0.0.1',
      allowAnyPort: true,
    });
    expect(await failure(fetcher(`http://first.test:${local.port}/start`, { mode: 'page' }))).toBe('blocked');
    expect(calls).toEqual(['first.test', 'rebound.test']);
    expect(local.hits.map((h) => h.url)).toEqual(['/start']);
  });
});

describe('redirects', () => {
  it('follows a relative and an absolute redirect, and reports where it ended', async () => {
    const local = await serve((req, res) => {
      if (req.url === '/a') res.writeHead(301, { Location: '/b' }).end();
      else if (req.url === '/b') res.writeHead(307, { Location: `http://other.test:${local.port}/c?x=1` }).end();
      else page(res);
    });
    const { fetcher } = trusting();
    const result = await fetcher(`http://site.test:${local.port}/a`, { mode: 'page' });
    expect(result.url).toBe(`http://other.test:${local.port}/c?x=1`);
    expect(local.hits.map((h) => h.url)).toEqual(['/a', '/b', '/c?x=1']);
  });

  it('follows three redirects and refuses a fourth', async () => {
    const local = await serve((req, res) => {
      const n = Number(/\/(\d)$/.exec(req.url ?? '')?.[1] ?? 0);
      if (n < 4) res.writeHead(302, { Location: `/${n + 1}` }).end();
      else page(res);
    });
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/0`, { mode: 'page' }))).toBe('redirects');
    expect(local.hits.map((h) => h.url)).toEqual(['/0', '/1', '/2', '/3']);
    local.hits.length = 0;
    expect((await fetcher(`http://site.test:${local.port}/1`, { mode: 'page' })).status).toBe(200);
  });

  it('refuses a loop', async () => {
    const local = await serve((_req, res) => res.writeHead(302, { Location: '/' }).end());
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'page' }))).toBe('redirects');
  });

  it('refuses a redirect into the private network, by address or by name', async () => {
    const local = await serve((req, res) => {
      const target: Record<string, string> = {
        '/metadata': 'http://169.254.169.254/latest/meta-data/',
        '/loopback6': 'http://[::1]/',
        '/inside': `http://inside.test:${local.port}/`,
        '/decimal': 'http://2852039166/', // 169.254.169.254 written as one number
        '/ten': 'http://10.0.0.1/admin',
        '/mixed': `http://mixed.test:${local.port}/`,
      };
      res.writeHead(302, { Location: target[req.url ?? ''] }).end();
    });
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/metadata`, { mode: 'page' }))).toBe('blocked');
    expect(await failure(fetcher(`http://site.test:${local.port}/loopback6`, { mode: 'page' }))).toBe('redirects');
    expect(await failure(fetcher(`http://site.test:${local.port}/inside`, { mode: 'page' }))).toBe('blocked');
    expect(await failure(fetcher(`http://site.test:${local.port}/decimal`, { mode: 'page' }))).toBe('blocked');
    expect(await failure(fetcher(`http://site.test:${local.port}/ten`, { mode: 'page' }))).toBe('blocked');
    expect(await failure(fetcher(`http://site.test:${local.port}/mixed`, { mode: 'page' }))).toBe('blocked');
  });

  it('refuses a redirect to another scheme, a user name or a bare name', async () => {
    const local = await serve((req, res) => {
      const target: Record<string, string> = {
        '/ftp': 'ftp://site.test/x',
        '/js': 'javascript:alert(1)',
        '/file': 'file:///etc/passwd',
        '/user': `http://admin@site.test:${local.port}/`,
        '/bare': 'http://intranet/',
        '/data': 'data:text/html,hi',
      };
      res.writeHead(302, { Location: target[req.url ?? ''] }).end();
    });
    const { fetcher } = trusting();
    for (const path of ['/ftp', '/js', '/file', '/user', '/bare', '/data']) {
      expect(await failure(fetcher(`http://site.test:${local.port}${path}`, { mode: 'page' })), path).toBe('redirects');
    }
  });

  it('treats a redirect with no Location as a failure', async () => {
    const local = await serve((_req, res) => res.writeHead(302).end());
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'page' }))).toBe('status');
  });
});

describe('what it accepts back', () => {
  it('gives the page, its media type and its charset', async () => {
    const local = await serve((_req, res) => page(res, html('<title>你好</title>'), 'Text/HTML; charset=Big5'));
    const { fetcher } = trusting();
    const result = await fetcher(`http://site.test:${local.port}/`, { mode: 'page' });
    expect(result).toMatchObject({ status: 200, contentType: 'text/html', charset: 'Big5', url: `http://site.test:${local.port}/` });
    expect(result.body.toString()).toContain('<title>');
  });

  it('takes application/xhtml+xml pages', async () => {
    const local = await serve((_req, res) => page(res, '<html/>', 'application/xhtml+xml'));
    const { fetcher } = trusting();
    expect((await fetcher(`http://site.test:${local.port}/`, { mode: 'page' })).contentType).toBe('application/xhtml+xml');
  });

  it.each([['image/png'], ['application/json'], ['text/plain'], ['application/octet-stream'], ['application/pdf'], ['image/svg+xml'], ['']])(
    'refuses %j as a page',
    async (type) => {
      const local = await serve((_req, res) => {
        if (type) res.setHeader('Content-Type', type);
        res.end('<html><head><title>x</title></head></html>');
      });
      const { fetcher } = trusting();
      expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'page' }))).toBe('content_type');
    },
  );

  it.each([['text/html'], ['image/svg+xml'], ['image/svg'], ['application/octet-stream'], ['application/pdf'], ['']])('refuses %j as an image', async (type) => {
    const local = await serve((_req, res) => {
      if (type) res.setHeader('Content-Type', type);
      res.end(Buffer.alloc(64));
    });
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'image' }))).toBe('content_type');
  });

  it('takes image/* that is not SVG', async () => {
    const local = await serve((_req, res) => {
      res.setHeader('Content-Type', 'image/png');
      res.end(Buffer.alloc(64, 7));
    });
    const { fetcher } = trusting();
    const result = await fetcher(`http://site.test:${local.port}/`, { mode: 'image' });
    expect(result.body).toHaveLength(64);
    expect(result.truncated).toBe(false);
  });

  it('refuses an error status', async () => {
    const local = await serve((req, res) => res.writeHead(req.url === '/gone' ? 404 : 500, { 'Content-Type': 'text/html' }).end('<html/>'));
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/gone`, { mode: 'page' }))).toBe('status');
    expect(await failure(fetcher(`http://site.test:${local.port}/boom`, { mode: 'page' }))).toBe('status');
  });
});

describe('how much it reads', () => {
  it('stops a page at the end of its head, however much more the server has to say', async () => {
    let wrote = 0;
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<html><head><title>T</title></head><body>');
      const timer = setInterval(() => {
        wrote += 64 * 1024;
        res.write('x'.repeat(64 * 1024));
      }, 5);
      res.on('close', () => clearInterval(timer));
    });
    const { fetcher } = trusting();
    const result = await fetcher(`http://site.test:${local.port}/`, { mode: 'page' });
    expect(result.truncated).toBe(true);
    expect(result.body.toString()).toContain('</head>');
    expect(result.body.length).toBeLessThan(1000);
    expect(wrote).toBeLessThan(PAGE_MAX_BYTES);
  });

  it('stops a page with no end of head at 512 KB', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('a'.repeat(3 * 1024 * 1024));
    });
    const { fetcher } = trusting();
    const result = await fetcher(`http://site.test:${local.port}/`, { mode: 'page' });
    expect(result.body.length).toBe(PAGE_MAX_BYTES);
    expect(result.truncated).toBe(true);
  });

  it('finds </head> even when it is split between two chunks, in any case', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<head><title>T</title></he');
      setTimeout(() => res.write('AD><body>' + 'x'.repeat(1000)), 30);
      setTimeout(() => res.end('y'.repeat(100000)), 60);
    });
    const { fetcher } = trusting();
    const result = await fetcher(`http://site.test:${local.port}/`, { mode: 'page' });
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBeLessThan(2000);
  });

  it('finds </head> that arrives two bytes at a time', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      const pieces = '<head><title>T</title></head><body>'.match(/.{1,2}/g)!;
      let at = 0;
      const timer = setInterval(() => {
        if (at < pieces.length) res.write(pieces[at++]);
        // After the head the server would go on for a long time.
        else res.write('z'.repeat(1000));
      }, 2);
      res.on('close', () => clearInterval(timer));
    });
    const { fetcher } = trusting();
    const result = await fetcher(`http://site.test:${local.port}/`, { mode: 'page' });
    expect(result.truncated).toBe(true);
    expect(result.body.toString()).toMatch(/^<head><title>T<\/title><\/head>?$/);
  });

  it('refuses an image whose Content-Length is over 5 MB before reading it', async () => {
    let sent = 0;
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': String(IMAGE_MAX_BYTES + 1) });
      res.write(Buffer.alloc(1024));
      sent += 1024;
      // Never finishes: a fetcher that waited for the body would hang.
    });
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'image' }))).toBe('too_large');
    expect(sent).toBe(1024);
  });

  it('refuses an image that turns out larger than 5 MB with no Content-Length', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(Buffer.alloc(IMAGE_MAX_BYTES + 4096));
    });
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'image' }))).toBe('too_large');
  });

  it('takes an image of exactly 5 MB', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/webp' });
      res.end(Buffer.alloc(IMAGE_MAX_BYTES, 1));
    });
    const { fetcher } = trusting();
    expect((await fetcher(`http://site.test:${local.port}/`, { mode: 'image' })).body.length).toBe(IMAGE_MAX_BYTES);
  });

  it('honours a smaller cap', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.alloc(5000));
    });
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'image', maxBytes: 4000 }))).toBe('too_large');
  });

  it('gives what a page sent before its connection dropped, and nothing of an image that was cut off', async () => {
    const local = await serve((req, res) => {
      res.writeHead(200, { 'Content-Type': req.url === '/img' ? 'image/png' : 'text/html', 'Content-Length': '100000' });
      res.write(req.url === '/img' ? Buffer.alloc(500) : '<head><title>partial</title>');
      setTimeout(() => res.destroy(), 30);
    });
    const { fetcher } = trusting();
    const partial = await fetcher(`http://site.test:${local.port}/`, { mode: 'page' });
    expect(partial.body.toString()).toContain('partial');
    expect(await failure(fetcher(`http://site.test:${local.port}/img`, { mode: 'image' }))).toBe('network');
  });
});

describe('compression', () => {
  const head = '<!doctype html><head><title>Squeezed</title></head><body>';

  it.each([
    ['gzip', (b: Buffer) => zlib.gzipSync(b)],
    ['deflate', (b: Buffer) => zlib.deflateSync(b)],
    ['br', (b: Buffer) => zlib.brotliCompressSync(b)],
  ])('reads a %s page', async (encoding, compress) => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': encoding });
      res.end(compress(Buffer.from(head + 'x'.repeat(5000))));
    });
    const { fetcher } = trusting();
    const result = await fetcher(`http://site.test:${local.port}/`, { mode: 'page' });
    expect(result.body.toString()).toContain('Squeezed');
    expect(local.hits[0].headers['accept-encoding']).toBe('gzip, deflate, br');
  });

  it('inflates a gzip bomb only as far as a page may be read', async () => {
    // 200 MB of zeros squeeze to about 200 KB.
    const bomb = zlib.gzipSync(Buffer.alloc(200 * 1024 * 1024), { level: 9 });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
      res.end(bomb);
    });
    const { fetcher } = trusting();
    const started = Date.now();
    const result = await fetcher(`http://site.test:${local.port}/`, { mode: 'page' });
    expect(result.body.length).toBe(PAGE_MAX_BYTES);
    expect(result.truncated).toBe(true);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('survives a stream cut short and a stream that is not gzip at all', async () => {
    const cut = zlib.gzipSync(Buffer.from(head + 'y'.repeat(20000))).subarray(0, 60);
    const local = await serve((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
      res.end(req.url === '/cut' ? cut : 'this is not gzip');
    });
    const { fetcher } = trusting();
    const truncated = await fetcher(`http://site.test:${local.port}/cut`, { mode: 'page' });
    expect(truncated.body.length).toBeGreaterThanOrEqual(0);
    expect(await failure(fetcher(`http://site.test:${local.port}/bad`, { mode: 'page' }))).toBe('encoding');
  });

  it('refuses an encoding it did not ask for', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'zstd' });
      res.end('xx');
    });
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'page' }))).toBe('encoding');
  });

  it('asks for an image uncompressed and refuses one that comes compressed anyway', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Encoding': 'gzip' });
      res.end(zlib.gzipSync(Buffer.alloc(100)));
    });
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'image' }))).toBe('encoding');
    expect(local.hits[0].headers['accept-encoding']).toBe('identity');
  });
});

describe('time', () => {
  it('gives up on a server that never answers', async () => {
    const local = await serve(() => {
      /* accepts the request and says nothing */
    });
    const { fetcher } = trusting();
    const started = Date.now();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'page', timeoutMs: 250 }))).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('cuts a server that dribbles its page out one byte at a time (slowloris) at the deadline', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      const timer = setInterval(() => res.write('<'), 20);
      res.on('close', () => clearInterval(timer));
    });
    const { fetcher } = trusting();
    const started = Date.now();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'page', timeoutMs: 300 }))).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('counts redirects against the same deadline', async () => {
    const local = await serve((req, res) => {
      const delay = setTimeout(() => res.writeHead(302, { Location: `/${(req.url ?? '').length}` }).end(), 120);
      res.on('close', () => clearTimeout(delay));
    });
    const { fetcher } = trusting();
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'page', timeoutMs: 300 }))).toBe('timeout');
  });

  it('stops when the caller aborts', async () => {
    const local = await serve(() => {});
    const { fetcher } = trusting();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    expect(await failure(fetcher(`http://site.test:${local.port}/`, { mode: 'page', signal: controller.signal }))).toBe('timeout');
  });
});

describe('what it sends', () => {
  it('sends no cookie, credential or referrer, and a plain User-Agent that names us', async () => {
    const local = await serve((_req, res) => page(res));
    const { fetcher } = trusting();
    await fetcher(`http://site.test:${local.port}/path?q=1#fragment`, { mode: 'page' });
    const sent = local.hits[0];
    expect(sent.url).toBe('/path?q=1');
    expect(sent.headers['user-agent']).toBe(USER_AGENT);
    expect(USER_AGENT).toContain('ResonanceBot');
    for (const name of ['cookie', 'authorization', 'referer', 'origin', 'x-forwarded-for', 'proxy-authorization']) {
      expect(sent.headers[name], name).toBeUndefined();
    }
    expect(sent.headers.accept).toContain('text/html');
    expect(sent.headers.connection).toBe('close');
  });

  it('asks for images, not pages, in image mode', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.alloc(8));
    });
    const { fetcher } = trusting();
    await fetcher(`http://site.test:${local.port}/a.png`, { mode: 'image' });
    expect(local.hits[0].headers.accept).toContain('image/');
    expect(local.hits[0].headers.accept).not.toContain('text/html');
  });

  it('ignores cookies the server sets: a second request carries none', async () => {
    const local = await serve((req, res) => {
      if (req.url === '/set') res.writeHead(302, { Location: '/next', 'Set-Cookie': 'session=1; Path=/' }).end();
      else page(res);
    });
    const { fetcher } = trusting();
    await fetcher(`http://site.test:${local.port}/set`, { mode: 'page' });
    expect(local.hits[1].url).toBe('/next');
    expect(local.hits[1].headers.cookie).toBeUndefined();
  });

  it('opens a connection per request, so nothing vetted for one name is reused for another', async () => {
    const sockets = new Set<unknown>();
    const local = await serve((req, res) => {
      sockets.add(req.socket);
      page(res);
    });
    const { fetcher } = trusting();
    await fetcher(`http://site.test:${local.port}/1`, { mode: 'page' });
    await fetcher(`http://site.test:${local.port}/2`, { mode: 'page' });
    expect(sockets.size).toBe(2);
  });
});

// TLS: the certificate is checked against the NAME in the link even though the
// connection goes to the vetted address, so an address swapped in behind a
// name still has to speak for the name.
function selfSigned(name: string): { key: string; cert: string } | null {
  const dir = mkdtempSync(join(tmpdir(), 'safefetch-tls-'));
  try {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '2', '-subj', `/CN=${name}`, '-addext', `subjectAltName=DNS:${name}`],
      { stdio: 'ignore' },
    );
    return { key: readFileSync(join(dir, 'k.pem'), 'utf8'), cert: readFileSync(join(dir, 'c.pem'), 'utf8') };
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const identity = selfSigned('secure.test');

describe.skipIf(!identity)('https', () => {
  async function serveTls(): Promise<{ port: number; names: (string | false)[] }> {
    const names: (string | false)[] = [];
    const server = https.createServer({ key: identity!.key, cert: identity!.cert }, (req, res) => {
      names.push((req.socket as Socket & { servername?: string | false }).servername ?? false);
      page(res);
    });
    servers.push(server as unknown as http.Server);
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    return { port: (server.address() as AddressInfo).port, names };
  }

  const policy = (ca?: string) =>
    createSafeFetch({
      async resolve(host) {
        return host === 'secure.test' || host === 'other.test' ? ['127.0.0.1'] : [];
      },
      allowAddress: (ip) => ip === '127.0.0.1',
      allowAnyPort: true,
      tlsCa: ca,
    });

  it('fetches over TLS from the vetted address, naming the site in the handshake', async () => {
    const tls = await serveTls();
    const result = await policy(identity!.cert)(`https://secure.test:${tls.port}/`, { mode: 'page' });
    expect(result.status).toBe(200);
    expect(tls.names).toEqual(['secure.test']);
  });

  it('refuses a certificate that is not for the name, even from an address it vetted', async () => {
    const tls = await serveTls();
    expect(await failure(policy(identity!.cert)(`https://other.test:${tls.port}/`, { mode: 'page' }))).toBe('network');
    // The handshake failed before any request was sent.
    expect(tls.names).toEqual([]);
  });

  it('refuses a certificate no authority we trust has signed', async () => {
    const tls = await serveTls();
    expect(await failure(policy()(`https://secure.test:${tls.port}/`, { mode: 'page' }))).toBe('network');
  });
});
