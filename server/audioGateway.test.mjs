import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { Readable, Writable, getDefaultHighWaterMark, setDefaultHighWaterMark } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import test from 'node:test';
import {
  createAudioGateway,
  createIcyAudioStripper,
  isPublicIPv4,
  resolvePublicAddress,
  resolveTrustedDns,
  validateStreamUrl,
} from './audioGateway.mjs';

const stationId = '961fa288-0601-11e8-ae97-52543be04c81';
const station = {
  stationuuid: stationId,
  url_resolved: 'https://radio.example.com/live.mp3',
  hls: 0,
};

function upstream(statusCode, headers, body = '') {
  const response = Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(body)]);
  response.statusCode = statusCode;
  response.headers = headers;
  return response;
}

async function stripAudio(interval, chunks) {
  const audio = [];
  await pipeline(
    Readable.from(chunks),
    createIcyAudioStripper(interval),
    new Writable({
      write(chunk, _encoding, callback) {
        audio.push(chunk);
        callback();
      },
    })
  );
  return Buffer.concat(audio);
}

async function fixture(t, options = {}) {
  const requests = [];
  const gateway = createAudioGateway({
    startModel: async () => null,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    openRequest: async (url, requestOptions) => {
      requests.push({ url, options: requestOptions });
      if (url.hostname.endsWith('radio-browser.info')) {
        return upstream(200, { 'content-type': 'application/json' }, JSON.stringify([station]));
      }
      if (url.hostname === '127.0.0.1') throw new Error('No local model');
      return upstream(200, { 'content-type': 'audio/mpeg' }, 'real audio bytes');
    },
    ...options,
  });
  const server = http.createServer((request, response) =>
    gateway(request, response, () => {
      response.writeHead(404);
      response.end('Other middleware');
    })
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolveClose) => {
        server.close(resolveClose);
        server.closeAllConnections();
      })
  );
  return { base: `http://127.0.0.1:${server.address().port}`, requests };
}

test('only permits routable IPv4 addresses and rejects private, metadata, and reserved ranges', () => {
  for (const address of [
    '0.1.2.3',
    '10.0.0.1',
    '127.0.0.1',
    '100.64.0.1',
    '100.127.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '192.0.0.8',
    '192.0.2.1',
    '192.88.99.1',
    '198.18.0.1',
    '198.19.255.254',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:127.0.0.1',
    'localhost',
    '1.2.3.999',
  ])
    assert.equal(isPublicIPv4(address), false, address);
  for (const address of [
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '100.63.255.254',
    '172.15.255.254',
  ]) {
    assert.equal(isPublicIPv4(address), true, address);
  }
});

test('rejects credentials, unsafe protocols, canonicalized loopback, IPv6, and local names', () => {
  for (const address of [
    'file:///etc/passwd',
    'ftp://radio.example.com/live',
    'https://user:pass@radio.example.com/live',
    'http://2130706433/live',
    'http://0x7f000001/live',
    'http://127.1/live',
    'http://[::1]/live',
    'http://[::ffff:7f00:1]/live',
    'http://localhost/live',
    'http://home.arpa/live',
    'http://radio.local/live',
    'http://service.internal/live',
    'https://radio.example.com/live#fragment',
  ])
    assert.throws(() => validateStreamUrl(address), undefined, address);
  assert.equal(validateStreamUrl('https://radio.example.com:8443/live.mp3').port, '8443');
});

test('rejects a DNS answer containing a private address instead of selecting around it', async () => {
  await assert.rejects(
    resolvePublicAddress('radio.example.com', async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ])
  );
  await assert.rejects(resolvePublicAddress('radio.example.com', async () => []));
});

test('unrelated paths pass to following middleware and capabilities remain available with no model', async (t) => {
  const { base } = await fixture(t);
  assert.equal(await (await fetch(`${base}/map`)).text(), 'Other middleware');
  const response = await fetch(`${base}/api/audio/capabilities`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    protocol: 'radio-audio',
    version: 1,
    proxy: true,
    model: { state: 'offline', name: 'facebook/pe-av-large' },
  });
});

test('rejects arbitrary URL parameters, malformed station IDs, and cross-site requests before lookup', async (t) => {
  const { base, requests } = await fixture(t);
  assert.equal(
    (await fetch(`${base}/api/audio/stream/${stationId}?url=http://127.0.0.1`)).status,
    400
  );
  assert.equal((await fetch(`${base}/api/audio/stream/anything`)).status, 400);
  assert.equal(
    (
      await fetch(`${base}/api/audio/stream/${stationId}`, {
        headers: { Origin: 'https://other.example.com' },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await fetch(`${base}/api/audio/stream/${stationId}`, {
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      })
    ).status,
    403
  );
  assert.equal(requests.length, 0);
});

test('uses registry UUID, pins validated DNS, strips incoming credentials, and caches only metadata', async (t) => {
  const { base, requests } = await fixture(t);
  const response = await fetch(`${base}/api/audio/stream/${stationId}`, {
    headers: { Cookie: 'secret=1', Authorization: 'Bearer secret', Range: 'bytes=0-' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), 'real audio bytes');
  const streamRequest = requests.find(({ url }) => url.hostname === 'radio.example.com');
  assert.equal(streamRequest.options.address, '93.184.216.34');
  assert.equal(streamRequest.options.headers.Range, 'bytes=0-');
  assert.equal(streamRequest.options.headers['Icy-MetaData'], '0');
  assert.equal(streamRequest.options.headers.Cookie, undefined);
  assert.equal(streamRequest.options.headers.Authorization, undefined);
  await (await fetch(`${base}/api/audio/stream/${stationId}`)).text();
  assert.equal(requests.filter(({ url }) => url.hostname.endsWith('radio-browser.info')).length, 1);
  assert.equal(requests.filter(({ url }) => url.hostname === 'radio.example.com').length, 2);
});

test('a registry listing cannot authorize a different station UUID', async (t) => {
  const { base } = await fixture(t, {
    openRequest: async () =>
      upstream(200, {}, JSON.stringify([{ ...station, stationuuid: 'other-id' }])),
  });
  assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 404);
});

test('revalidates redirect targets and never connects to private IPs', async (t) => {
  const connections = [];
  const { base } = await fixture(t, {
    openRequest: async (url) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      connections.push(url.hostname);
      return upstream(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    },
  });
  assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 502);
  assert.deepEqual(connections, ['radio.example.com']);
});

test('a public-looking redirect that resolves to a private network is rejected', async (t) => {
  const connections = [];
  const { base } = await fixture(t, {
    lookup: async (hostname) => [
      { address: hostname === 'next.example.com' ? '192.168.0.1' : '93.184.216.34' },
    ],
    openRequest: async (url) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      connections.push(url.hostname);
      return upstream(302, { location: 'https://next.example.com/live' });
    },
  });
  assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 502);
  assert.deepEqual(connections, ['radio.example.com']);
});

test('redirect loops stop after four redirects', async (t) => {
  let streamRequests = 0;
  const { base } = await fixture(t, {
    openRequest: async (url) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      streamRequests++;
      return upstream(302, { location: '/another' });
    },
  });
  assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 502);
  assert.equal(streamRequests, 5);
});

test('HLS and non-audio upstream responses fail cleanly for direct-playback fallback', async (t) => {
  const hls = await fixture(t, {
    openRequest: async () => upstream(200, {}, JSON.stringify([{ ...station, hls: 1 }])),
  });
  assert.equal((await fetch(`${hls.base}/api/audio/stream/${stationId}`)).status, 422);
  for (const type of ['text/html', 'application/json', 'audio/x-mpegurl']) {
    const { base } = await fixture(t, {
      openRequest: async (url) =>
        url.hostname.endsWith('radio-browser.info')
          ? upstream(200, {}, JSON.stringify([station]))
          : upstream(200, { 'content-type': type }, 'not audio'),
    });
    assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 422);
  }
});

test('PCM endpoint rejects bad sample rate, malformed samples, and oversized payloads', async (t) => {
  const { base } = await fixture(t);
  assert.equal(
    (
      await fetch(`${base}/api/audio/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '16000' },
        body: Buffer.alloc(4),
      })
    ).status,
    415
  );
  assert.equal(
    (
      await fetch(`${base}/api/audio/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '48000' },
        body: Buffer.alloc(3),
      })
    ).status,
    400
  );
  assert.equal(
    (
      await fetch(`${base}/api/audio/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '48000' },
        body: Buffer.alloc(1152004),
      })
    ).status,
    413
  );
});

test('forwards actual bounded PCM only to the fixed local model and preserves busy responses', async (t) => {
  const pcm = Buffer.alloc(48000 * 4);
  let modelRequest;
  const { base } = await fixture(t, {
    openRequest: async (url, options) => {
      modelRequest = { url, options };
      return upstream(429, {}, JSON.stringify({ error: 'Model is analyzing another window.' }));
    },
  });
  const response = await fetch(`${base}/api/audio/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '48000' },
    body: pcm,
  });
  assert.equal(response.status, 429);
  assert.equal(modelRequest.url.href, 'http://127.0.0.1:8765/analyze');
  assert.equal(modelRequest.options.headers['X-Sample-Rate'], '48000');
  assert.deepEqual(modelRequest.options.body, pcm);
});

test('client disconnect destroys the source and releases its connection allowance', async (t) => {
  let activeSource;
  const { base } = await fixture(t, {
    maxConnectionsPerAddress: 1,
    openRequest: async (url) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      activeSource = new Readable({ read() {} });
      activeSource.statusCode = 200;
      activeSource.headers = { 'content-type': 'audio/mpeg' };
      activeSource.push(Buffer.from('live frame'));
      return activeSource;
    },
  });
  const controller = new AbortController();
  const first = await fetch(`${base}/api/audio/stream/${stationId}`, { signal: controller.signal });
  assert.equal(first.status, 200);
  assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 429);
  const source = activeSource;
  controller.abort();
  await new Promise((resolveWait) => setTimeout(resolveWait, 30));
  assert.equal(source.destroyed, true);
  const second = await fetch(`${base}/api/audio/stream/${stationId}`);
  assert.equal(second.status, 200);
  await second.body.cancel();
});

test('allows overlapping browser streams within the per-client limit and rejects excess connections', async (t) => {
  const controllers = [];
  t.after(() => controllers.forEach((controller) => controller.abort()));
  const { base } = await fixture(t, {
    openRequest: async (url) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      const source = new Readable({ read() {} });
      source.statusCode = 200;
      source.headers = { 'content-type': 'audio/mpeg' };
      source.push(Buffer.from('live frame'));
      return source;
    },
  });
  for (let index = 0; index < 4; index++) {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${base}/api/audio/stream/${stationId}`, {
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
  }
  assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 429);
});

test('rejects oversized chunked PCM without buffering the rest of its body', async (t) => {
  const { base } = await fixture(t);
  const status = await new Promise((resolveStatus, reject) => {
    const request = http.request(
      `${base}/api/audio/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '48000' },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolveStatus(response.statusCode));
      }
    );
    request.once('error', reject);
    request.write(Buffer.alloc(1152004));
    request.end();
  });
  assert.equal(status, 413);
});

test('caps and status trigger lazy startup without making a missing model block streaming', async (t) => {
  let starts = 0;
  const { base } = await fixture(t, {
    startModel: async () => {
      starts++;
      return null;
    },
  });
  assert.equal(
    (await (await fetch(`${base}/api/audio/capabilities`)).json()).model.state,
    'offline'
  );
  assert.equal((await (await fetch(`${base}/api/audio/model/status`)).json()).state, 'offline');
  assert.equal(starts, 2);
  assert.equal(
    await (await fetch(`${base}/api/audio/stream/${stationId}`)).text(),
    'real audio bytes'
  );
});

test('caps concurrent model work and releases the slot after a result', async (t) => {
  let finishAnalysis;
  let entered;
  const analysisEntered = new Promise((resolveEntered) => {
    entered = resolveEntered;
  });
  const { base } = await fixture(t, {
    maxAnalyses: 1,
    openRequest: async () => {
      entered();
      return new Promise((resolveAnalysis) => {
        finishAnalysis = resolveAnalysis;
      });
    },
  });
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '48000' },
    body: Buffer.alloc(4),
  };
  const first = fetch(`${base}/api/audio/analyze`, options);
  await analysisEntered;
  assert.equal((await fetch(`${base}/api/audio/analyze`, options)).status, 429);
  finishAnalysis(upstream(200, {}, JSON.stringify({ energy: 0.5 })));
  assert.equal((await first).status, 200);
  const next = fetch(`${base}/api/audio/analyze`, options);
  await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  finishAnalysis(upstream(200, {}, JSON.stringify({ energy: 0.2 })));
  assert.equal((await next).status, 200);
});

test('only a complete benchmark-range DNS answer triggers trusted resolution', async () => {
  let trustedCalls = 0;
  const settings = {
    trustedResolve: async (hostname) => {
      trustedCalls++;
      assert.equal(hostname, 'radio.example.com');
      return ['204.93.226.69'];
    },
  };
  assert.equal(
    await resolvePublicAddress(
      'radio.example.com',
      async () => [{ address: '198.18.0.1' }, { address: '198.19.255.254' }],
      settings
    ),
    '204.93.226.69'
  );
  assert.equal(trustedCalls, 1);
  for (const addresses of [
    ['198.18.0.1', '127.0.0.1'],
    ['198.18.0.1', '93.184.216.34'],
    ['10.0.0.1'],
  ])
    await assert.rejects(
      resolvePublicAddress(
        'radio.example.com',
        async () => addresses.map((address) => ({ address })),
        settings
      )
    );
  assert.equal(trustedCalls, 1);
  await assert.rejects(resolvePublicAddress('198.18.0.1', undefined, settings));
  assert.equal(trustedCalls, 1);
});

test('trusted DNS uses fixed HTTPS endpoints and public pinned provider IPs', async () => {
  let requested;
  const addresses = await resolveTrustedDns('radio.example.com', {
    openRequest: async (url, options) => {
      requested = { url, options };
      return upstream(
        200,
        {},
        JSON.stringify({
          Status: 0,
          TC: false,
          CD: false,
          Question: [{ name: 'radio.example.com.', type: 1 }],
          Answer: [{ name: 'radio.example.com.', type: 1, data: '93.184.216.34' }],
        })
      );
    },
  });
  assert.deepEqual(addresses, ['93.184.216.34']);
  assert.equal(requested.url.origin, 'https://cloudflare-dns.com');
  assert.equal(requested.url.pathname, '/dns-query');
  assert.equal(requested.url.searchParams.get('name'), 'radio.example.com');
  assert.equal(requested.url.searchParams.get('type'), 'A');
  assert.equal(requested.options.address, '1.1.1.1');
  assert.equal(requested.options.timeoutMs, 5000);
});

test('trusted DNS rejects private, fake, IPv6, or mixed A records without trying around them', async () => {
  for (const addresses of [['127.0.0.1'], ['198.18.0.1'], ['::1'], ['93.184.216.34', '10.0.0.1']]) {
    let requests = 0;
    await assert.rejects(
      resolveTrustedDns('radio.example.com', {
        openRequest: async () => {
          requests++;
          return upstream(
            200,
            {},
            JSON.stringify({
              Status: 0,
              Question: [{ name: 'radio.example.com.', type: 1 }],
              Answer: addresses.map((data) => ({ type: 1, data })),
            })
          );
        },
      })
    );
    assert.equal(requests, 1);
  }
});

test('trusted DNS rejects redirects, mismatched queries, truncated answers, and oversized JSON', async () => {
  for (const payload of [
    {
      Status: 0,
      Question: [{ name: 'different.example.com', type: 1 }],
      Answer: [{ type: 1, data: '93.184.216.34' }],
    },
    {
      Status: 0,
      TC: true,
      Question: [{ name: 'radio.example.com', type: 1 }],
      Answer: [{ type: 1, data: '93.184.216.34' }],
    },
    {
      Status: 0,
      Question: [{ name: 'radio.example.com', type: 28 }],
      Answer: [{ type: 1, data: '93.184.216.34' }],
    },
  ])
    await assert.rejects(
      resolveTrustedDns('radio.example.com', {
        openRequest: async () => upstream(200, {}, JSON.stringify(payload)),
      })
    );
  await assert.rejects(
    resolveTrustedDns('radio.example.com', {
      openRequest: async () => upstream(302, { location: 'http://127.0.0.1' }),
    })
  );
  await assert.rejects(
    resolveTrustedDns('radio.example.com', {
      openRequest: async () => upstream(200, {}, ' '.repeat(32769)),
    })
  );
});

test('gateway pins the trusted real IP after fake-IP lookup and streams the real payload', async (t) => {
  let pinned;
  const { base } = await fixture(t, {
    lookup: async () => [{ address: '198.18.0.99', family: 4 }],
    openRequest: async (url, options) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      if (url.hostname === 'cloudflare-dns.com')
        return upstream(
          200,
          {},
          JSON.stringify({
            Status: 0,
            Question: [{ name: 'radio.example.com', type: 1 }],
            Answer: [{ type: 1, data: '93.184.216.34' }],
          })
        );
      pinned = options.address;
      return upstream(200, { 'content-type': 'audio/mpeg' }, 'real payload');
    },
  });
  assert.equal(await (await fetch(`${base}/api/audio/stream/${stationId}`)).text(), 'real payload');
  assert.equal(pinned, '93.184.216.34');
});

test('preserves ordinary audio and range headers when ICY metadata is absent or disabled', async (t) => {
  for (const interval of [undefined, '0']) {
    const { base } = await fixture(t, {
      openRequest: async (url, options) => {
        if (url.hostname.endsWith('radio-browser.info'))
          return upstream(200, {}, JSON.stringify([station]));
        assert.equal(options.headers.Range, 'bytes=10-21');
        return upstream(
          206,
          {
            'content-type': 'audio/mpeg',
            ...(interval === undefined ? {} : { 'icy-metaint': interval }),
            'content-length': '12',
            'content-range': 'bytes 10-21/100',
            'accept-ranges': 'bytes',
          },
          'real payload'
        );
      },
    });
    const response = await fetch(`${base}/api/audio/stream/${stationId}`, {
      headers: { Range: 'bytes=10-21' },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-length'), '12');
    assert.equal(response.headers.get('content-range'), 'bytes 10-21/100');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(await response.text(), 'real payload');
  }
});

test('strips arbitrary split ICY metadata and retains every audio byte in order', async () => {
  const first = Buffer.from([0, 255, 40, 128]);
  const second = Buffer.from([12, 13, 14, 15]);
  const last = Buffer.from([1, 2]);
  const encoded = Buffer.concat([
    first,
    Buffer.from([2]),
    Buffer.from("StreamTitle='Test';".padEnd(32, '\0')),
    second,
    Buffer.from([0]),
    last,
  ]);
  for (const chunkSize of [1, 2, 3, 4, 5, 9, 16, encoded.length]) {
    const chunks = [];
    for (let offset = 0; offset < encoded.length; offset += chunkSize)
      chunks.push(encoded.subarray(offset, offset + chunkSize));
    assert.deepEqual(await stripAudio(4, chunks), Buffer.concat([first, second, last]));
  }
});

test('handles maximum ICY metadata length without accumulating metadata or changing audio', async () => {
  const encoded = Buffer.concat([
    Buffer.from('abcd'),
    Buffer.from([255]),
    Buffer.alloc(255 * 16, 255),
    Buffer.from('ef'),
  ]);
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += 17)
    chunks.push(encoded.subarray(offset, offset + 17));
  assert.deepEqual(await stripAudio(4, chunks), Buffer.from('abcdef'));
  assert.deepEqual(
    await stripAudio(1024 * 1024, [Buffer.from('short audio')]),
    Buffer.from('short audio')
  );
});

test('fails closed on truncated ICY length or metadata but permits a partial final audio interval', async () => {
  for (const body of [
    Buffer.from('abcd'),
    Buffer.concat([Buffer.from('abcd'), Buffer.from([1]), Buffer.alloc(15)]),
    Buffer.concat([Buffer.from('abcd'), Buffer.from([255]), Buffer.alloc(4079)]),
  ])
    await assert.rejects(stripAudio(4, [body]), /ended during ICY metadata/);
  assert.deepEqual(await stripAudio(4, [Buffer.from('abc')]), Buffer.from('abc'));
  assert.deepEqual(
    await stripAudio(4, [Buffer.from('abcd'), Buffer.from([0])]),
    Buffer.from('abcd')
  );
});

test('rejects invalid metadata intervals before creating a transform or forwarding audio', async (t) => {
  for (const interval of [0, -1, 0.5, NaN, Infinity, 1048577, '4', undefined])
    assert.throws(() => createIcyAudioStripper(interval), /invalid metadata interval/);
  for (const interval of [
    '-1',
    '1.5',
    'Infinity',
    '0x10',
    '1e3',
    '',
    ' 4',
    '1048577',
    '9999999999999',
    ['4', '8'],
  ]) {
    let source;
    const { base } = await fixture(t, {
      openRequest: async (url) => {
        if (url.hostname.endsWith('radio-browser.info'))
          return upstream(200, {}, JSON.stringify([station]));
        source = upstream(200, { 'content-type': 'audio/mpeg', 'icy-metaint': interval }, 'data');
        return source;
      },
    });
    assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 422);
    assert.equal(source.destroyed, true);
  }
});

test('reopens metadata streams without a nonzero Range and omits encoded lengths and range headers', async (t) => {
  const requests = [];
  let ranged;
  const { base } = await fixture(t, {
    openRequest: async (url, options) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      requests.push(options);
      if (options.headers.Range) {
        ranged = upstream(
          206,
          { 'content-type': 'audio/mpeg', 'icy-metaint': '4', 'content-range': 'bytes 99-100/200' },
          'unsafe offset'
        );
        return ranged;
      }
      return upstream(
        206,
        {
          'content-type': 'audio/mpeg',
          'icy-metaint': '4',
          'content-length': '23',
          'content-range': 'bytes 0-22/23',
          'accept-ranges': 'bytes',
        },
        Buffer.concat([Buffer.from('abcd'), Buffer.from([1]), Buffer.alloc(16), Buffer.from('ef')])
      );
    },
  });
  const response = await fetch(`${base}/api/audio/stream/${stationId}`, {
    headers: { Range: 'bytes=99-' },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'abcdef');
  for (const header of ['content-length', 'content-range', 'accept-ranges', 'icy-metaint'])
    assert.equal(response.headers.get(header), null);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.Range, 'bytes=99-');
  assert.equal(requests[1].headers.Range, undefined);
  assert.equal(ranged.destroyed, true);
});

test('rejects an unsolicited nonzero metadata range and revalidates a reopened redirect', async (t) => {
  const partial = await fixture(t, {
    openRequest: async (url) =>
      url.hostname.endsWith('radio-browser.info')
        ? upstream(200, {}, JSON.stringify([station]))
        : upstream(
            206,
            { 'content-type': 'audio/mpeg', 'icy-metaint': '4', 'content-range': 'bytes 1-4/100' },
            'data'
          ),
  });
  assert.equal((await fetch(`${partial.base}/api/audio/stream/${stationId}`)).status, 422);
  const contacted = [];
  const reopened = await fixture(t, {
    openRequest: async (url, options) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      contacted.push(url.hostname);
      if (options.headers.Range)
        return upstream(200, { 'content-type': 'audio/mpeg', 'icy-metaint': '4' }, 'data');
      return upstream(302, { location: 'http://127.0.0.1/unsafe' });
    },
  });
  assert.equal(
    (
      await fetch(`${reopened.base}/api/audio/stream/${stationId}`, {
        headers: { Range: 'bytes=9-' },
      })
    ).status,
    502
  );
  assert.deepEqual(contacted, ['radio.example.com', 'radio.example.com']);
});

for (const transformCapacity of [16 * 1024, 64 * 1024]) {
  test(`the ICY transform propagates backpressure with ${transformCapacity / 1024} KiB buffers`, async (t) => {
    const audioBlockSize = 4096;
    const encodedBlockSize = audioBlockSize + 1;
    const totalBlocks = 512;
    const originalCapacity = getDefaultHighWaterMark(false);
    let stripper;
    try {
      setDefaultHighWaterMark(false, transformCapacity);
      stripper = createIcyAudioStripper(audioBlockSize);
    } finally {
      setDefaultHighWaterMark(false, originalCapacity);
    }
    let generated = 0;
    let bytesWritten = 0;
    let writeEntered;
    let releaseWrite;
    const entered = new Promise((resolveEntered) => {
      writeEntered = resolveEntered;
    });
    const source = new Readable({
      highWaterMark: audioBlockSize,
      read() {
        if (generated >= totalBlocks) this.push(null);
        else {
          generated++;
          this.push(Buffer.concat([Buffer.alloc(audioBlockSize, 42), Buffer.from([0])]));
        }
      },
    });
    const destination = new Writable({
      highWaterMark: audioBlockSize,
      write(chunk, _encoding, callback) {
        bytesWritten += chunk.length;
        if (!releaseWrite) {
          releaseWrite = callback;
          writeEntered();
        } else callback();
      },
    });
    t.after(() => {
      if (!destination.writableFinished && !destination.destroyed) releaseWrite?.();
    });
    const bufferedBlockLimit =
      Math.ceil(source.readableHighWaterMark / encodedBlockSize) +
      Math.ceil(stripper.writableHighWaterMark / encodedBlockSize) +
      Math.ceil(stripper.readableHighWaterMark / audioBlockSize) +
      Math.ceil(destination.writableHighWaterMark / audioBlockSize) +
      1;
    const writing = pipeline(source, stripper, destination);
    await entered;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    assert.ok(
      generated <= bufferedBlockLimit,
      `Read ${generated} blocks with capacity for ${bufferedBlockLimit} while the destination was blocked.`
    );
    assert.ok(generated < totalBlocks);
    releaseWrite();
    await writing;
    assert.equal(bytesWritten, audioBlockSize * totalBlocks);
    assert.equal(generated, totalBlocks);
  });
}

test('metadata stream cancellation destroys the source and releases its connection allowance', async (t) => {
  let activeSource;
  const { base } = await fixture(t, {
    maxConnectionsPerAddress: 1,
    openRequest: async (url) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      activeSource = new Readable({ read() {} });
      activeSource.statusCode = 200;
      activeSource.headers = { 'content-type': 'audio/mpeg', 'icy-metaint': '4' };
      activeSource.push(Buffer.concat([Buffer.from('abcd'), Buffer.from([1]), Buffer.alloc(5)]));
      return activeSource;
    },
  });
  const controller = new AbortController();
  const response = await fetch(`${base}/api/audio/stream/${stationId}`, {
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 429);
  const source = activeSource;
  controller.abort();
  await new Promise((resolveWait) => setTimeout(resolveWait, 30));
  assert.equal(source.destroyed, true);
  const next = await fetch(`${base}/api/audio/stream/${stationId}`);
  assert.equal(next.status, 200);
  await next.body.cancel();
});

test('truncated metadata terminates the response and releases the slot for another stream', async (t) => {
  let requests = 0;
  const { base } = await fixture(t, {
    maxConnectionsPerAddress: 1,
    openRequest: async (url) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      requests++;
      return upstream(
        200,
        { 'content-type': 'audio/mpeg', 'icy-metaint': '4' },
        requests === 1
          ? Buffer.concat([Buffer.from('abcd'), Buffer.from([1]), Buffer.alloc(15)])
          : Buffer.from('abc')
      );
    },
  });
  await assert.rejects(async () => {
    const response = await fetch(`${base}/api/audio/stream/${stationId}`);
    await response.arrayBuffer();
  });
  assert.equal(await (await fetch(`${base}/api/audio/stream/${stationId}`)).text(), 'abc');
});

test('connection deadlines abort a stalled lookup, return 504, and release the stream slot', async (t) => {
  let resolveLookup;
  let lookups = 0;
  let streamRequests = 0;
  const { base } = await fixture(t, {
    streamConnectTimeoutMs: 60,
    maxConnectionsPerAddress: 1,
    lookup: async () => {
      if (lookups++ === 0)
        return new Promise((resolveLate) => {
          resolveLookup = resolveLate;
        });
      return [{ address: '93.184.216.34', family: 4 }];
    },
    openRequest: async (url) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      streamRequests++;
      return upstream(200, { 'content-type': 'audio/mpeg' }, 'audio');
    },
  });
  const response = await fetch(`${base}/api/audio/stream/${stationId}`);
  assert.equal(response.status, 504);
  assert.match((await response.json()).error, /connection timed out/);
  assert.equal(await (await fetch(`${base}/api/audio/stream/${stationId}`)).text(), 'audio');
  resolveLookup([{ address: '93.184.216.34', family: 4 }]);
  await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  assert.equal(streamRequests, 1);
});

test('connection deadlines destroy a late upstream and do not impose a limit on a connected live stream', async (t) => {
  let resolveRequest;
  let streamRequests = 0;
  let live;
  const { base } = await fixture(t, {
    streamConnectTimeoutMs: 60,
    maxConnectionsPerAddress: 1,
    openRequest: async (url) => {
      if (url.hostname.endsWith('radio-browser.info'))
        return upstream(200, {}, JSON.stringify([station]));
      if (streamRequests++ === 0)
        return new Promise((resolveLate) => {
          resolveRequest = resolveLate;
        });
      live = new Readable({ read() {} });
      live.statusCode = 200;
      live.headers = { 'content-type': 'audio/mpeg' };
      live.push(Buffer.from('audio'));
      return live;
    },
  });
  assert.equal((await fetch(`${base}/api/audio/stream/${stationId}`)).status, 504);
  const late = upstream(200, { 'content-type': 'audio/mpeg' }, 'late audio');
  resolveRequest(late);
  await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  assert.equal(late.destroyed, true);
  const response = await fetch(`${base}/api/audio/stream/${stationId}`);
  const reader = response.body.getReader();
  assert.equal(response.status, 200);
  assert.equal(Buffer.from((await reader.read()).value).toString(), 'audio');
  await new Promise((resolveWait) => setTimeout(resolveWait, 90));
  assert.equal(live.destroyed, false);
  live.push(Buffer.from('still live'));
  assert.equal(Buffer.from((await reader.read()).value).toString(), 'still live');
  await reader.cancel();
});
