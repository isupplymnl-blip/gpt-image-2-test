const http = require('http');
const https = require('https');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 8889;
const jobs = new Map(); // jobId -> { status, result, error, createdAt }

// Clean up jobs older than 30 minutes
setInterval(() => {
const cutoff = Date.now() - 30 * 60 * 1000;
for (const [id, job] of jobs) {
if (job.createdAt < cutoff) jobs.delete(id);
}
}, 5 * 60 * 1000);

function forwardToPudding(jobId, { url, method, headers, body }) {
const job = jobs.get(jobId);
const parsed = new URL(url);

const options = {
hostname: parsed.hostname,
port: parsed.port || 443,
path: parsed.pathname + parsed.search,
method,
headers,
timeout: 600_000, // 10 min
};

const proto = parsed.protocol === 'https:' ? https : http;
const req = proto.request(options, (res) => {
const chunks = [];
res.on('data', (chunk) => chunks.push(chunk));
res.on('end', () => {
const raw = Buffer.concat(chunks);
if (res.statusCode >= 200 && res.statusCode < 300) {
job.status = 'done';
job.result = { status: res.statusCode, body: raw.toString('base64'), contentType: res.headers['content-type'] };
} else {
job.status = 'error';
job.error = `Pudding error ${res.statusCode}: ${raw.toString('utf8').slice(0, 500)}`;
}
});
});

req.on('timeout', () => {
req.destroy();
job.status = 'error';
job.error = 'Request to Pudding timed out after 10 minutes';
});

req.on('error', (err) => {
job.status = 'error';
job.error = err.message;
});

if (body) req.write(body);
req.end();
}

const server = http.createServer((req, res) => {
const url = new URL(req.url, `http://localhost:${PORT}`);

// Health check
if (req.method === 'GET' && url.pathname === '/health') {
res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ ok: true, jobs: jobs.size }));
return;
}

// Submit job: POST /submit
if (req.method === 'POST' && url.pathname === '/submit') {
const chunks = [];
req.on('data', (c) => chunks.push(c));
req.on('end', () => {
let payload;
try {
payload = JSON.parse(Buffer.concat(chunks).toString());
} catch {
res.writeHead(400);
res.end('Invalid JSON');
return;
}

const jobId = randomUUID();
jobs.set(jobId, { status: 'pending', createdAt: Date.now() });

// Decode body from base64 if provided (for binary multipart)
const body = payload.bodyBase64 ? Buffer.from(payload.bodyBase64, 'base64') : payload.body;

// Kick off in background — no await
setImmediate(() => forwardToPudding(jobId, { ...payload, body }));

res.writeHead(202, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ jobId }));
});
return;
}

// Poll job: GET /job/:id
const match = url.pathname.match(/^\/job\/([a-f0-9-]+)$/);
if (req.method === 'GET' && match) {
const job = jobs.get(match[1]);
if (!job) {
res.writeHead(404);
res.end('Not found');
return;
}
res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ status: job.status, result: job.result, error: job.error }));
return;
}

res.writeHead(404);
res.end('Not found');
});

server.listen(PORT, () => {
console.log(`[relay] listening on :${PORT}`);
});
