import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { startAudioService } from '../scripts/audioService.mjs';

const REGISTRIES = [
  'https://de1.api.radio-browser.info',
  'https://fr1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_NAME = 'facebook/pe-av-large';
const MAX_PCM_BYTES = 48000 * 6 * 4;
const MAX_REDIRECTS = 4;
const MAX_REGISTRY_BYTES = 512 * 1024;
const MAX_MODEL_RESPONSE_BYTES = 128 * 1024;
const MAX_ICY_INTERVAL = 1024 * 1024;
const DNS_PROVIDERS = [
  { url: 'https://cloudflare-dns.com/dns-query', address: '1.1.1.1' },
  { url: 'https://dns.google/resolve', address: '8.8.8.8' },
];

function isFakeAddress(address) {
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 198 && (b === 18 || b === 19);
}

export class GatewayError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
  }
}

function icyMetadataInterval(value) {
  if (value === undefined) return 0;
  if (typeof value !== 'string' || !/^\d{1,7}$/.test(value)) {
    throw new GatewayError('The station has an invalid metadata interval.', 422);
  }
  const interval = Number(value);
  if (interval > MAX_ICY_INTERVAL) {
    throw new GatewayError('The station metadata interval is too large.', 422);
  }
  return interval;
}

export function createIcyAudioStripper(interval) {
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_ICY_INTERVAL) {
    throw new GatewayError('The station has an invalid metadata interval.', 422);
  }
  let audioRemaining = interval;
  let metadataRemaining = 0;
  let awaitingLength = false;
  return new Transform({
    transform(chunk, _encoding, callback) {
      let offset = 0;
      while (offset < chunk.length) {
        if (metadataRemaining > 0) {
          const length = Math.min(metadataRemaining, chunk.length - offset);
          metadataRemaining -= length;
          offset += length;
          if (metadataRemaining === 0) audioRemaining = interval;
        } else if (awaitingLength) {
          metadataRemaining = chunk[offset++] * 16;
          awaitingLength = false;
          if (metadataRemaining === 0) audioRemaining = interval;
        } else {
          const length = Math.min(audioRemaining, chunk.length - offset);
          this.push(chunk.subarray(offset, offset + length));
          audioRemaining -= length;
          offset += length;
          if (audioRemaining === 0) awaitingLength = true;
        }
      }
      callback();
    },
    flush(callback) {
      callback(
        metadataRemaining > 0 || awaitingLength
          ? new GatewayError('The station ended during ICY metadata.')
          : null
      );
    },
  });
}

function withAbort(operation, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
    if (signal.aborted) abort();
  });
}

export function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function validateStreamUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new GatewayError('The station has an invalid stream address.');
  }
  const hostname = url.hostname.toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    value.length > 8192 ||
    hostname.includes(':') ||
    (!isIP(hostname) && !hostname.includes('.')) ||
    /(^|\.)(localhost|local|internal|home\.arpa)$/.test(hostname) ||
    (isIP(hostname) && !isPublicIPv4(hostname))
  ) {
    throw new GatewayError('The station stream address is not permitted.');
  }
  return url;
}

export async function resolveTrustedDns(hostname, options = {}) {
  const { openRequest = requestResource, signal } = options;
  for (const provider of DNS_PROVIDERS) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 5000);
    timeout.unref();
    if (signal?.aborted) controller.abort();
    try {
      const url = new URL(provider.url);
      url.searchParams.set('name', hostname);
      url.searchParams.set('type', 'A');
      url.searchParams.set('edns_client_subnet', '0.0.0.0/0');
      const response = await openRequest(url, {
        signal: controller.signal,
        address: provider.address,
        timeoutMs: 5000,
        headers: { Accept: 'application/dns-json', 'Accept-Encoding': 'identity' },
      });
      if (response.statusCode !== 200) {
        response.destroy();
        throw new GatewayError('The trusted DNS resolver is unavailable.');
      }
      const payload = JSON.parse((await readBounded(response, 32768)).toString('utf8'));
      const question = payload.Question;
      if (
        payload.Status !== 0 ||
        payload.TC === true ||
        payload.CD === true ||
        !Array.isArray(question) ||
        question.length !== 1 ||
        question[0]?.type !== 1 ||
        String(question[0]?.name || '')
          .replace(/\.$/, '')
          .toLowerCase() !== hostname.replace(/\.$/, '').toLowerCase() ||
        !Array.isArray(payload.Answer)
      )
        throw new GatewayError('The trusted DNS resolver returned an invalid answer.');
      const addresses = payload.Answer.filter((answer) => answer?.type === 1).map(
        (answer) => answer.data
      );
      if (!addresses.length || addresses.some((address) => !isPublicIPv4(address))) {
        throw new GatewayError('The station address is not public.', 403);
      }
      return addresses;
    } catch (error) {
      if (signal?.aborted || (error instanceof GatewayError && error.status === 403)) throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  throw new GatewayError('The trusted DNS resolver is unavailable.');
}

export async function resolvePublicAddress(hostname, lookup = dnsLookup, options = {}) {
  if (isIP(hostname)) {
    if (!isPublicIPv4(hostname)) throw new GatewayError('The station address is not public.');
    return hostname;
  }
  const addresses = await lookup(hostname, { all: true, family: 4 });
  if (addresses.length && addresses.every(({ address }) => isFakeAddress(address))) {
    const trustedResolve = options.trustedResolve || resolveTrustedDns;
    const resolved = await trustedResolve(hostname, { signal: options.signal });
    if (
      !Array.isArray(resolved) ||
      !resolved.length ||
      resolved.some((address) => !isPublicIPv4(address))
    ) {
      throw new GatewayError('The station address is not public.');
    }
    return resolved[0];
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicIPv4(address))) {
    throw new GatewayError('The station address is not public.');
  }
  return addresses[0].address;
}

function requestResource(url, options = {}) {
  const { signal, address, headers = {}, method = 'GET', body, timeoutMs = 15000 } = options;
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method,
        signal,
        headers,
        agent: false,
        ...(address
          ? {
              family: 4,
              lookup: (_hostname, lookupOptions, callback) => {
                if (lookupOptions.all) callback(null, [{ address, family: 4 }]);
                else callback(null, address, 4);
              },
            }
          : {}),
      },
      (response) => {
        clearTimeout(headerTimeout);
        response.setTimeout(30000, () =>
          response.destroy(new GatewayError('Stream data timed out.'))
        );
        resolve(response);
      }
    );
    const headerTimeout = setTimeout(
      () => request.destroy(new GatewayError('The station did not respond in time.')),
      timeoutMs
    );
    headerTimeout.unref();
    request.once('error', (error) => {
      clearTimeout(headerTimeout);
      reject(error);
    });
    request.end(body);
  });
}

async function readBounded(response, maximum) {
  const chunks = [];
  let length = 0;
  for await (const chunk of response) {
    length += chunk.length;
    if (length > maximum) {
      response.destroy();
      throw new GatewayError('The upstream response exceeded its size limit.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

function readPcm(request, signal) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    const timeout = setTimeout(
      () => finish(new GatewayError('Audio upload timed out.', 408)),
      10000
    );
    timeout.unref();
    const onData = (chunk) => {
      length += chunk.length;
      if (length > MAX_PCM_BYTES)
        finish(new GatewayError('Audio analysis accepts at most six seconds.', 413));
      else chunks.push(chunk);
    };
    const onEnd = () => finish(null, Buffer.concat(chunks, length));
    const onError = (error) => finish(error);
    const onAbort = () => finish(new GatewayError('Audio upload was cancelled.', 499));
    const finish = (error, result) => {
      clearTimeout(timeout);
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      if (error) {
        request.pause();
        reject(error);
      } else resolve(result);
    };
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function sendJson(response, status, payload) {
  if (response.destroyed || response.headersSent) return;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

export function createAudioGateway(options = {}) {
  const {
    lookup = dnsLookup,
    openRequest = requestResource,
    now = Date.now,
    modelPort = Number(process.env.AUDIO_MODEL_PORT || 8765),
    maxConnections = 8,
    maxConnectionsPerAddress = 2,
    maxAnalyses = 2,
    streamConnectTimeoutMs = 20000,
    trustedOrigins = [],
    startModel = startAudioService,
  } = options;
  const stationCache = new Map();
  const registryRequests = new Map();
  const connections = new Map();
  let activeConnections = 0;
  let activeAnalyses = 0;

  async function loadStation(uuid, signal) {
    const cached = stationCache.get(uuid);
    if (cached && cached.expiresAt > now()) return cached.station;
    if (registryRequests.has(uuid)) return registryRequests.get(uuid);
    const loading = (async () => {
      let lastError;
      for (const base of REGISTRIES) {
        try {
          const url = new URL(`/json/stations/byuuid/${uuid}`, base);
          const upstream = await openRequest(url, {
            signal,
            timeoutMs: 2000,
            headers: { Accept: 'application/json', 'User-Agent': 'RadioExplorer/1.0' },
          });
          if (signal.aborted) {
            upstream.destroy();
            signal.throwIfAborted();
          }
          if (upstream.statusCode !== 200) {
            upstream.destroy();
            throw new GatewayError('The station registry is temporarily unavailable.');
          }
          const payload = JSON.parse(
            (await readBounded(upstream, MAX_REGISTRY_BYTES)).toString('utf8')
          );
          const station = Array.isArray(payload)
            ? payload.find((entry) => entry?.stationuuid?.toLowerCase() === uuid.toLowerCase())
            : null;
          if (!station) throw new GatewayError('This station is not in the radio registry.', 404);
          if (station.hls === 1) {
            throw new GatewayError('This station needs direct HLS playback.', 422);
          }
          validateStreamUrl(station.url_resolved || station.url || '');
          if (stationCache.size >= 256) stationCache.delete(stationCache.keys().next().value);
          stationCache.set(uuid, { station, expiresAt: now() + 300000 });
          return station;
        } catch (error) {
          if (signal.aborted || (error instanceof GatewayError && error.status !== 502))
            throw error;
          lastError = error;
        }
      }
      throw lastError || new GatewayError('The station registry is temporarily unavailable.');
    })();
    registryRequests.set(uuid, loading);
    try {
      return await loading;
    } finally {
      registryRequests.delete(uuid);
    }
  }

  async function openStation(url, signal, range) {
    const initialUrl = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const address = await resolvePublicAddress(url.hostname, lookup, {
        signal,
        trustedResolve: (hostname, settings) =>
          resolveTrustedDns(hostname, { ...settings, openRequest }),
      });
      signal.throwIfAborted();
      const upstream = await openRequest(url, {
        signal,
        address,
        timeoutMs: 5000,
        headers: {
          Accept: 'audio/*, application/ogg, application/octet-stream',
          'Accept-Encoding': 'identity',
          'Icy-MetaData': '0',
          'User-Agent': 'RadioExplorer/1.0',
          ...(range ? { Range: range } : {}),
        },
      });
      if (signal.aborted) {
        upstream.destroy();
        signal.throwIfAborted();
      }
      if ([301, 302, 303, 307, 308].includes(upstream.statusCode)) {
        const location = upstream.headers.location;
        upstream.destroy();
        if (!location || hop === MAX_REDIRECTS) {
          throw new GatewayError('The station redirected too many times.');
        }
        url = validateStreamUrl(new URL(location, url).href);
        continue;
      }
      const contentType = String(upstream.headers['content-type'] || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (
        ![200, 206].includes(upstream.statusCode) ||
        !/^(audio\/[^\s]+|application\/(ogg|octet-stream))$/.test(contentType) ||
        /mpegurl|scpls|playlist/.test(contentType) ||
        (upstream.headers['content-encoding'] &&
          upstream.headers['content-encoding'] !== 'identity')
      ) {
        upstream.destroy();
        throw new GatewayError('This stream needs direct playback.', 422);
      }
      let metadataInterval;
      try {
        metadataInterval = icyMetadataInterval(upstream.headers['icy-metaint']);
      } catch (error) {
        upstream.destroy();
        throw error;
      }
      if (metadataInterval > 0 && range) {
        upstream.destroy();
        return openStation(initialUrl, signal);
      }
      if (
        metadataInterval > 0 &&
        upstream.statusCode === 206 &&
        !/^bytes 0-\d+\/(\d+|\*)$/.test(String(upstream.headers['content-range'] || ''))
      ) {
        upstream.destroy();
        throw new GatewayError('The station returned an unsafe metadata range.', 422);
      }
      return { upstream, metadataInterval };
    }
    throw new GatewayError('The station redirected too many times.');
  }

  async function modelStatus(signal) {
    void startModel({ port: modelPort }).catch(() => {});
    try {
      const upstream = await openRequest(new URL(`http://127.0.0.1:${modelPort}/status`), {
        signal,
        timeoutMs: 1500,
        headers: { Accept: 'application/json' },
      });
      if (upstream.statusCode !== 200) {
        upstream.destroy();
        throw new GatewayError('The audio model is unavailable.');
      }
      const status = JSON.parse(
        (await readBounded(upstream, MAX_MODEL_RESPONSE_BYTES)).toString('utf8')
      );
      if (!['loading', 'ready', 'error'].includes(status.state) || status.name !== MODEL_NAME) {
        throw new GatewayError('The audio model returned an invalid status.');
      }
      return status;
    } catch {
      return { state: 'offline', name: MODEL_NAME };
    }
  }

  async function handle(request, response, next) {
    let url;
    try {
      url = new URL(request.url || '/', 'http://gateway.local');
    } catch {
      return next();
    }
    if (!url.pathname.startsWith('/api/audio/')) return next();
    const origin = request.headers.origin;
    const expectedOrigin = `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
    if (
      request.headers['sec-fetch-site'] === 'cross-site' ||
      (origin && origin !== expectedOrigin && !trustedOrigins.includes(origin))
    ) {
      return sendJson(response, 403, { error: 'Audio requests must come from this site.' });
    }
    if (url.search)
      return sendJson(response, 400, { error: 'Audio endpoints do not accept query parameters.' });
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once('aborted', abort);
    response.once('close', abort);
    try {
      if (url.pathname === '/api/audio/capabilities' && request.method === 'GET') {
        const model = await modelStatus(controller.signal);
        return sendJson(response, 200, { protocol: 'radio-audio', version: 1, proxy: true, model });
      }
      if (url.pathname === '/api/audio/model/status' && request.method === 'GET') {
        return sendJson(response, 200, await modelStatus(controller.signal));
      }
      if (url.pathname === '/api/audio/analyze' && request.method === 'POST') {
        if (activeAnalyses >= maxAnalyses) {
          return sendJson(response, 429, { error: 'The audio model is busy.' });
        }
        if (
          String(request.headers['content-type'] || '').split(';')[0] !==
            'application/octet-stream' ||
          request.headers['x-sample-rate'] !== '48000'
        ) {
          return sendJson(response, 415, { error: 'Send Float32 PCM at 48000 Hz.' });
        }
        const declaredLength = Number(request.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_PCM_BYTES) {
          return sendJson(response, 413, { error: 'Audio analysis accepts at most six seconds.' });
        }
        activeAnalyses++;
        try {
          const pcm = await readPcm(request, controller.signal);
          if (!pcm.length || pcm.length % 4 !== 0) {
            return sendJson(response, 400, { error: 'The PCM buffer is invalid.' });
          }
          const upstream = await openRequest(new URL(`http://127.0.0.1:${modelPort}/analyze`), {
            signal: controller.signal,
            method: 'POST',
            timeoutMs: 120000,
            body: pcm,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(pcm.length),
              'X-Sample-Rate': '48000',
            },
          });
          const payload = JSON.parse(
            (await readBounded(upstream, MAX_MODEL_RESPONSE_BYTES)).toString('utf8')
          );
          return sendJson(response, upstream.statusCode || 502, payload);
        } finally {
          activeAnalyses--;
        }
      }
      if (url.pathname.startsWith('/api/audio/stream/') && request.method === 'GET') {
        const uuid = url.pathname.slice('/api/audio/stream/'.length);
        if (!UUID.test(uuid))
          return sendJson(response, 400, { error: 'A station UUID is required.' });
        const clientAddress = request.socket.remoteAddress || 'unknown';
        const clientConnections = connections.get(clientAddress) || 0;
        if (activeConnections >= maxConnections || clientConnections >= maxConnectionsPerAddress) {
          return sendJson(response, 429, { error: 'Too many active audio streams.' });
        }
        activeConnections++;
        connections.set(clientAddress, clientConnections + 1);
        const connectionTimeout = setTimeout(() => {
          sendJson(response, 504, { error: 'The station connection timed out.' });
          controller.abort();
        }, streamConnectTimeoutMs);
        connectionTimeout.unref();
        try {
          const station = await withAbort(
            loadStation(uuid.toLowerCase(), controller.signal),
            controller.signal
          );
          const range = request.headers.range;
          if (range && !/^bytes=\d+-\d*$/.test(range)) {
            return sendJson(response, 416, { error: 'This audio range is not supported.' });
          }
          const { upstream, metadataInterval } = await withAbort(
            openStation(
              validateStreamUrl(station.url_resolved || station.url),
              controller.signal,
              range
            ),
            controller.signal
          );
          const headers = {
            'Content-Type': upstream.headers['content-type'],
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          };
          if (metadataInterval === 0) {
            for (const key of ['content-length', 'content-range', 'accept-ranges']) {
              if (upstream.headers[key]) headers[key] = upstream.headers[key];
            }
          }
          clearTimeout(connectionTimeout);
          response.writeHead(metadataInterval > 0 ? 200 : upstream.statusCode, headers);
          if (metadataInterval > 0) {
            await pipeline(upstream, createIcyAudioStripper(metadataInterval), response, {
              signal: controller.signal,
            });
          } else await pipeline(upstream, response, { signal: controller.signal });
        } finally {
          clearTimeout(connectionTimeout);
          activeConnections--;
          const count = (connections.get(clientAddress) || 1) - 1;
          if (count > 0) connections.set(clientAddress, count);
          else connections.delete(clientAddress);
        }
        return;
      }
      return sendJson(response, 404, { error: 'This audio endpoint does not exist.' });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (response.headersSent) response.destroy();
      else
        sendJson(response, error instanceof GatewayError ? error.status : 502, {
          error:
            error instanceof GatewayError
              ? error.message
              : 'The audio service is temporarily unavailable.',
        });
    } finally {
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    }
  }

  return (request, response, next) => {
    void handle(request, response, next);
  };
}
