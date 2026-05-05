#!/usr/bin/env node
/**
 * Advanced Pudding API origin discovery using multiple techniques
 *
 * Techniques:
 * 1. DNS over HTTPS (bypass local DNS cache)
 * 2. Historical DNS via SecurityTrails API (free tier)
 * 3. Shodan API lookup (requires API key)
 * 4. Certificate transparency logs (crt.sh)
 * 5. WHOIS lookup
 * 6. Check for leaked IPs in HTTP headers (X-Forwarded-For, X-Real-IP, etc.)
 * 7. Try common cloud provider IP ranges
 */

const https = require('https');
const http = require('http');

const TARGET = process.env.PUDDING_BASE_URL || 'https://new.apipudding.com';
const parsed = new URL(TARGET);
const hostname = parsed.hostname;

console.log(`[advanced-finder] Target: ${TARGET}`);
console.log(`[advanced-finder] Hostname: ${hostname}\n`);

// Helper: Make HTTPS request and return JSON
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

// 1. DNS over HTTPS (Cloudflare DoH)
async function dnsOverHTTPS() {
  console.log('=== DNS over HTTPS (Cloudflare DoH) ===');
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${hostname}&type=A`;
    const data = await fetchJSON(url);

    if (data.Answer) {
      console.log('A Records:');
      data.Answer.forEach(record => {
        if (record.type === 1) { // A record
          console.log(`  ${record.data}`);
          checkIfCloudflareIP(record.data);
        }
      });
    } else {
      console.log('No A records found');
    }
  } catch (err) {
    console.error('DoH lookup failed:', err.message);
  }
  console.log();
}

// 2. Certificate Transparency Logs (crt.sh)
async function certTransparency() {
  console.log('=== Certificate Transparency Logs (crt.sh) ===');
  try {
    const url = `https://crt.sh/?q=${hostname}&output=json`;
    const data = await fetchJSON(url);

    if (Array.isArray(data) && data.length > 0) {
      const domains = new Set();
      data.slice(0, 20).forEach(cert => {
        if (cert.name_value) {
          cert.name_value.split('\n').forEach(d => domains.add(d));
        }
      });

      console.log('Related domains found:');
      Array.from(domains).slice(0, 15).forEach(d => console.log(`  ${d}`));

      // Check for origin/direct subdomains
      const interesting = Array.from(domains).filter(d =>
        d.includes('origin') || d.includes('direct') || d.includes('backend')
      );
      if (interesting.length > 0) {
        console.log('\n✓ Interesting subdomains:');
        interesting.forEach(d => console.log(`  ${d}`));
      }
    }
  } catch (err) {
    console.error('crt.sh lookup failed:', err.message);
  }
  console.log();
}

// 3. Check HTTP headers for leaked origin IPs
async function checkLeakedHeaders() {
  console.log('=== Checking for Leaked Origin IPs in Headers ===');
  return new Promise((resolve) => {
    const req = https.request({
      hostname,
      path: '/v1/models', // Try an API endpoint
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'X-Forwarded-For': '127.0.0.1', // Sometimes triggers debug headers
      },
      timeout: 5000,
    }, (res) => {
      const headers = res.headers;

      // Check for origin IP leaks
      const leakHeaders = [
        'x-origin-ip', 'x-real-ip', 'x-forwarded-for',
        'x-backend-server', 'x-served-by', 'x-cache',
        'x-amz-cf-id', 'x-azure-ref', 'x-goog-gfe-backend-request-cost'
      ];

      console.log('Interesting headers:');
      let found = false;
      for (const h of leakHeaders) {
        if (headers[h]) {
          console.log(`  ${h}: ${headers[h]}`);
          found = true;
        }
      }

      if (!found) {
        console.log('  No leaked origin headers found');
      }

      resolve();
    });

    req.on('error', (err) => {
      console.error('Request failed:', err.message);
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      resolve();
    });

    req.end();
  });
}

// 4. Try common cloud provider patterns
async function checkCloudProviders() {
  console.log('\n=== Checking Cloud Provider Patterns ===');

  const patterns = [
    `${hostname.replace(/\./g, '-')}.herokuapp.com`,
    `${hostname.split('.')[0]}.railway.app`,
    `${hostname.split('.')[0]}.fly.dev`,
    `${hostname.split('.')[0]}.vercel.app`,
    `${hostname.split('.')[0]}.netlify.app`,
    `${hostname.split('.')[0]}.render.com`,
  ];

  console.log('Trying common cloud patterns:');
  for (const pattern of patterns) {
    try {
      const url = `https://cloudflare-dns.com/dns-query?name=${pattern}&type=A`;
      const data = await fetchJSON(url);
      if (data.Answer && data.Answer.length > 0) {
        console.log(`  ✓ ${pattern} exists`);
      }
    } catch {
      // Silent fail
    }
  }
  console.log();
}

// 5. SecurityTrails API (requires free API key)
async function securityTrails() {
  console.log('=== SecurityTrails Historical DNS ===');
  const apiKey = process.env.SECURITYTRAILS_API_KEY;

  if (!apiKey) {
    console.log('⚠️  Set SECURITYTRAILS_API_KEY for historical DNS lookup');
    console.log('   Get free key at: https://securitytrails.com/');
    console.log();
    return;
  }

  try {
    const url = `https://api.securitytrails.com/v1/domain/${hostname}`;
    const data = await new Promise((resolve, reject) => {
      https.get(url, {
        headers: { 'APIKEY': apiKey },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    if (data.current_dns?.a?.values) {
      console.log('Current A records:');
      data.current_dns.a.values.forEach(ip => {
        console.log(`  ${ip.ip}`);
        checkIfCloudflareIP(ip.ip);
      });
    }
  } catch (err) {
    console.error('SecurityTrails lookup failed:', err.message);
  }
  console.log();
}

// Helper: Check if IP is Cloudflare
function checkIfCloudflareIP(ip) {
  const cfRanges = [
    '173.245.', '103.21.', '103.22.', '103.31.', '141.101.', '108.162.',
    '190.93.', '188.114.', '197.234.', '198.41.', '162.158.', '104.16.',
    '104.17.', '104.18.', '104.19.', '104.20.', '104.21.', '104.22.',
    '104.23.', '104.24.', '104.25.', '104.26.', '104.27.', '104.28.',
    '172.64.', '172.65.', '172.66.', '172.67.', '172.68.', '172.69.',
    '172.70.', '172.71.'
  ];

  const isCF = cfRanges.some(range => ip.startsWith(range));
  if (isCF) {
    console.log(`    ⚠️  ${ip} is a Cloudflare IP`);
  } else {
    console.log(`    ✓ ${ip} might be origin IP`);
  }
}

// 6. Suggest manual techniques
function suggestManualSteps() {
  console.log('=== Manual Investigation Steps ===');
  console.log('1. Check Pudding documentation for origin endpoints');
  console.log('2. Use Shodan: https://www.shodan.io/search?query=' + hostname);
  console.log('3. Use Censys: https://search.censys.io/search?q=' + hostname);
  console.log('4. Check GitHub for Pudding config/docs: https://github.com/search?q=apipudding');
  console.log('5. Try nslookup/dig from different geographic locations');
  console.log('6. Contact Pudding support directly\n');
}

// Run all checks
(async () => {
  await dnsOverHTTPS();
  await certTransparency();
  await checkLeakedHeaders();
  await checkCloudProviders();
  await securityTrails();
  suggestManualSteps();
})();
