import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../audio-service');

function run(command, args, env = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: directory,
      windowsHide: true,
      stdio: 'inherit',
      env,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with status ${code}.`));
    });
  });
}

try {
  await run('uv', ['sync', '--locked', '--python', '3.12', '--project', directory]);
  const python = resolve(
    directory,
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
  );
  if (!existsSync(python)) throw new Error('The audio model Python environment was not created.');
  await run(python, [resolve(directory, 'prepare.py')], {
    ...process.env,
    PYTHONUNBUFFERED: '1',
  });
  console.log(
    'Perception Encoder AV Large is ready. Start or restart the website to enable local audio analysis.'
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
