import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const distRoot = resolve('dist');
const port = Number(process.env.PORT ?? 4173);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function resolveAsset(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const requestedPath = normalize(pathname === '/' ? '/index.html' : pathname);
  const assetPath = resolve(join(distRoot, requestedPath));

  if (!assetPath.startsWith(distRoot)) {
    return null;
  }

  if (existsSync(assetPath) && statSync(assetPath).isFile()) {
    return assetPath;
  }

  return join(distRoot, 'index.html');
}

createServer((request, response) => {
  const assetPath = resolveAsset(request.url ?? '/');

  if (!assetPath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(assetPath)] ?? 'application/octet-stream',
  });
  createReadStream(assetPath).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`GYY Carto preview: http://localhost:${port}`);
});
