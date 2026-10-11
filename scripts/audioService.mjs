import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let service = null;
let starting = null;
let generation = 0;

function hasRunningService(port) {
  return new Promise((resolveStatus) => {
    const request = http.get(`http://127.0.0.1:${port}/status`, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 16384) request.destroy();
        else chunks.push(chunk);
      });
      response.once('end', () => {
        try {
          const status = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolveStatus(status.name === 'facebook/pe-av-large');
        } catch {
          resolveStatus(false);
        }
      });
      response.once('error', () => resolveStatus(false));
    });
    request.setTimeout(500, () => request.destroy());
    request.once('error', () => resolveStatus(false));
  });
}

export function startAudioService(options = {}) {
  if (starting) return starting;
  if (service && service.exitCode === null) return Promise.resolve(service);
  if (process.env.AUDIO_MODEL_DISABLED === 'true') return Promise.resolve(null);
  const directory = options.directory || resolve(projectDirectory, 'audio-service');
  const port = options.port || Number(process.env.AUDIO_MODEL_PORT || 8765);
  const python = resolve(
    directory,
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
  );
  const manifestFile = resolve(directory, 'models/pe-av-large/manifest.json');
  if (!existsSync(python) || !existsSync(manifestFile)) return Promise.resolve(null);
  try {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (
      manifest.model !== 'facebook/pe-av-large' ||
      !manifest.audioWeights ||
      !manifest.textEmbeddings ||
      !existsSync(resolve(dirname(manifestFile), manifest.audioWeights)) ||
      !existsSync(resolve(dirname(manifestFile), manifest.textEmbeddings))
    )
      return Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
  const currentGeneration = generation;
  starting = (async () => {
    if (await hasRunningService(port)) return null;
    if (currentGeneration !== generation) return null;
    const child = spawn(python, [resolve(directory, 'server.py'), '--port', String(port)], {
      cwd: directory,
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    service = child;
    const stopOnExit = () => stopOwnedChild(child);
    const release = () => {
      process.removeListener('exit', stopOnExit);
      if (service === child) service = null;
    };
    process.once('exit', stopOnExit);
    child.once('error', release);
    child.once('exit', release);
    return child;
  })().finally(() => {
    starting = null;
  });
  return starting;
}

export function stopOwnedChild(ownedChild) {
  if (
    !ownedChild ||
    ownedChild.exitCode !== null ||
    ownedChild.signalCode !== null ||
    !Number.isInteger(ownedChild.pid) ||
    ownedChild.pid <= 0
  )
    return null;
  if (process.platform !== 'win32') {
    ownedChild.kill();
    return null;
  }
  const cleanup = spawn(
    resolve(process.env.SystemRoot || 'C:/Windows', 'System32/taskkill.exe'),
    ['/PID', String(ownedChild.pid), '/T', '/F'],
    { windowsHide: true, stdio: 'ignore' }
  );
  cleanup.once('error', () => {
    if (ownedChild.exitCode === null && ownedChild.signalCode === null) ownedChild.kill();
  });
  return cleanup;
}

export function stopAudioService() {
  generation++;
  const ownedChild = service;
  service = null;
  stopOwnedChild(ownedChild);
}
