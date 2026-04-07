const https = require('https');
const http = require('http');
const { URL } = require('url');

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时 (15s)')); });
    if (body) req.write(body);
    req.end();
  });
}

async function checkConnectivity(baseUrl) {
  const start = Date.now();
  try {
    const res = await httpRequest(baseUrl, { method: 'GET' });
    return { ok: true, status: res.status, latency: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err.message, latency: Date.now() - start };
  }
}

async function checkMessages(baseUrl, authToken, model) {
  const url = baseUrl.replace(/\/$/, '') + '/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const body = JSON.stringify({
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }],
  });

  const start = Date.now();
  try {
    const res = await httpRequest(url, { method: 'POST', headers }, body);
    const latency = Date.now() - start;
    const parsed = safeJsonParse(res.body);

    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, latency, model: parsed?.model, stopReason: parsed?.stop_reason };
    }

    return {
      ok: false,
      status: res.status,
      latency,
      error: parsed?.error?.message || parsed?.message || res.body.slice(0, 200),
    };
  } catch (err) {
    return { ok: false, error: err.message, latency: Date.now() - start };
  }
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

async function checkProfile(profileFiles) {
  const settings = profileFiles?.['settings.json'];
  const env = settings?.env || {};
  const baseUrl = env.ANTHROPIC_BASE_URL;

  if (!baseUrl) {
    return { type: 'official', skip: true, message: '官方 profile，跳过检查（使用 Keychain OAuth 认证）' };
  }

  const authToken = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY;
  const model = env.ANTHROPIC_MODEL;

  const results = { type: 'thirdparty', baseUrl, model };

  results.connectivity = await checkConnectivity(baseUrl);

  if (!results.connectivity.ok) {
    results.messages = { ok: false, error: '跳过（连通性检查失败）' };
    return results;
  }

  results.messages = await checkMessages(baseUrl, authToken, model);
  return results;
}

module.exports = { checkProfile, checkConnectivity, checkMessages };
