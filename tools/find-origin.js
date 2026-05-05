#!/usr/bin/env node
/**
 * Discover Pudding API origin IP/domain by bypassing Cloudflare
 *
 * Techniques:
 * 1. DNS lookup for A/AAAA records (may show CF IPs)
 * 2. Check common subdomains (origin.*, direct.*, api-origin.*)
 * 3. HTTP headers inspection (CF-Ray, Server, X-Served-By)
 * 4. SecurityTrails/DNS history lookup (requires API key)
 * 5. Check for alternate ports (8080, 8443, etc.)
 */

const dns = require('dns').promises;
const https = require('https');
const http = require('http');

const TARGET = process.env.PUDDING_BASE_URL || 'https://new.apipudding.com';
const parsed = new URL(TARGET);
const hostname = parsed.hostname;

console.log(`[find-origin] Target: ${TARGET}`);
console.log(`[find-origin] Hostname: ${hostname}\n`);

// 1. DNS lookup
async function dnsLookup() {
  console.log('=== DNS Lookup ===');
  try {
    const [ipv4, ipv6] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);

    if (ipv4.status === 'fulfilled') {
      console.log('IPv4:', ipv4.value.join(', '));
      // CF IP ranges: 173.245.48.0/20, 103.21.244.0/22, etc.
      const isCF = ipv4.value.some(ip =>
        ip.startsWith('173.245.') ||
        ip.startsWith('103.21.') ||
        ip.startsWith('104.16.') ||
        ip.startsWith('172.64.')
      );
      if (isCF) console.log('  ⚠️  Likely Cloudflare IP');
    }

    if (ipv6.status === 'fulfilled') {
      console.log('IPv6:', ipv6.value.join(', '));
    }
  } catch (err) {
    console.error('DNS lookup failed:', err.message);
  }
  console.log();
}

// 2. Check common origin subdomains
async function checkSubdomains() {
  console.log('=== Checking Origin Subdomains ===');
  const prefixes = ['origin', 'direct', 'api-origin', 'backend', 'server', 'prod'];
  const baseDomain = hostname.split('.').slice(-2).join('.'); // apipudding.com

  for (const prefix of prefixes) {
    const subdomain = `${prefix}.${baseDomain}`;
    try {
      const ips = await dns.resolve4(subdomain);
      console.log(`✓ ${subdomain} → ${ips.join(', ')}`);
    } catch {
      // Silent fail
    }
  }
  console.log();
}

// 3. HTTP headers inspection
async function inspectHeaders() {
  console.log('=== HTTP Headers Inspection ===');
  return new Promise((resolve) => {
    const req = https.request({
      hostname,
      path: '/',
      method: 'HEAD',
      timeout: 5000,
    }, (res) => {
      const headers = res.headers;
      console.log('Status:', res.statusCode);
      console.log('Server:', headers.server || 'N/A');
      console.log('CF-Ray:', headers['cf-ray'] || 'N/A');
      console.log('X-Served-By:', headers['x-served-by'] || 'N/A');
      console.log('Via:', headers.via || 'N/A');

      if (headers['cf-ray']) {
        console.log('  ⚠️  Cloudflare detected (cf-ray present)');
      }

      resolve();
    });

    req.on('error', (err) => {
      console.error('Request failed:', err.message);
      resolve();
    });

    req.on('timeout', () => {
      console.error('Request timed out');
      req.destroy();
      resolve();
    });

    req.end();
  });
  console.log();
}

// 4. Check alternate ports
async function checkAlternatePorts() {
  console.log('\n=== Checking Alternate Ports ===');
  const ports = [8080, 8443, 3000, 5000];

  for (const port of ports) {
    await new Promise((resolve) => {
      const proto = port === 8443 ? https : http;
      const req = proto.request({
        hostname,
        port,
        path: '/',
        method: 'HEAD',
        timeout: 3000,
        rejectUnauthorized: false, // Allow self-signed certs
      }, (res) => {
        console.log(`✓ Port ${port} open (${res.statusCode})`);
        resolve();
      });

      req.on('error', () => resolve());
      req.on('timeout', () => { req.destroy(); resolve(); });
      req.end();
    });
  }
  console.log();
}

// 5. Suggest next steps
function suggestNextSteps() {
  console.log('=== Next Steps ===');
  console.log('1. Contact Pudding support — ask for origin IP or non-CF endpoint');
  console.log('2. Check Pudding docs for alternate base URLs');
  console.log('3. Use SecurityTrails/Shodan to find historical DNS records');
  console.log('4. Try direct OpenAI API instead (no CF, but more expensive)');
  console.log('5. If Pudding is self-hosted, check their deployment docs\n');
}

// Run all checks
(async () => {
  await dnsLookup();
  await checkSubdomains();
  await inspectHeaders();
  await checkAlternatePorts();
  suggestNextSteps();
})();
