#!/usr/bin/env node
/**
 * Minimal node:http host for the Vedika Shopify app proxy. No dependencies.
 *
 *   SHOPIFY_API_SECRET=... VEDIKA_MODE=live VEDIKA_API_KEY=... PORT=8787 node app-proxy/server.mjs
 *
 * Put it behind HTTPS and set `[app_proxy] url` in shopify.app.toml to
 * `https://<your-host>/vedika-proxy`. Add a per-client rate limit at your load
 * balancer or WAF: every live call is billed to the Vedika account.
 */
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { handleAppProxyRequest } from './vedika-app-proxy.mjs';

const port = Number(process.env.PORT || 8787);

createServer(async (req, res) => {
  try {
    const request = new Request(new URL(req.url, `http://${req.headers.host || 'localhost'}`), { method: req.method });
    const response = await handleAppProxyRequest(request, process.env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"error":"upstream unavailable"}');
  }
}).listen(port, () => {
  console.log(`vedika app proxy listening on :${port} (mode ${process.env.VEDIKA_MODE === 'live' ? 'live' : 'sandbox'})`);
});
