import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { stopOwnedChild } from './audioService.mjs';

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitGone(pid) {
  for (let count = 0; count < 100; count++) {
    if (!isAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(isAlive(pid), false, `Owned test process ${pid} was not closed.`);
}

test('reloading an inactive model service does not accumulate exit listeners', async () => {
  const count = process.listenerCount('exit');
  const moduleUrl = new URL('./audioService.mjs', import.meta.url);
  for (let index = 0; index < 16; index++) {
    moduleUrl.searchParams.set('reload', String(index));
    const service = await import(moduleUrl.href);
    assert.equal(await service.startAudioService({ directory: 'missing-audio-service' }), null);
  }
  assert.equal(process.listenerCount('exit'), count);
});

test('never closes absent, exited, signalled, or invalid ownership handles', () => {
  const guard = () => assert.fail('An inactive process must not be killed.');
  for (const child of [
    null,
    { pid: 1, exitCode: 0, signalCode: null, kill: guard },
    { pid: 1, exitCode: null, signalCode: 'SIGTERM', kill: guard },
    { pid: 0, exitCode: null, signalCode: null, kill: guard },
    { pid: undefined, exitCode: null, signalCode: null, kill: guard },
  ])
    assert.equal(stopOwnedChild(child), null);
});

test(
  'Windows closes only the owned parent, child and grandchild tree',
  {
    skip: process.platform !== 'win32',
  },
  async (t) => {
    const leaf = 'setInterval(() => {}, 1000);';
    const middle = `const {spawn}=require('node:child_process'); const leaf=spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{windowsHide:true,stdio:'ignore'}); process.send({grandchild:leaf.pid});setInterval(()=>{},1000);`;
    const parent = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(middle)}],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});child.once('message',m=>process.send({child:child.pid,grandchild:m.grandchild}));setInterval(()=>{},1000);`;
    const independent = spawn(process.execPath, ['-e', leaf], {
      windowsHide: true,
      stdio: 'ignore',
    });
    const owned = spawn(process.execPath, ['-e', parent], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    t.after(() => {
      stopOwnedChild(owned);
      independent.kill();
    });
    const [tree] = await once(owned, 'message');
    const pids = [owned.pid, tree.child, tree.grandchild];
    for (const pid of pids) assert.equal(isAlive(pid), true);
    assert.equal(isAlive(independent.pid), true);
    const cleanup = stopOwnedChild(owned);
    assert.ok(cleanup);
    const [code] = await once(cleanup, 'exit');
    assert.equal(code, 0);
    await Promise.all(pids.map(waitGone));
    assert.equal(isAlive(independent.pid), true);
  }
);

test(
  'owned tree cleanup still executes when its Node owner exits',
  {
    skip: process.platform !== 'win32',
  },
  async (t) => {
    const moduleUrl = new URL('./audioService.mjs', import.meta.url).href;
    const leaf = 'setInterval(() => {}, 1000);';
    const parent = `const {spawn}=require('node:child_process');const leaf=spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{windowsHide:true,stdio:'ignore'});process.send({child:leaf.pid});setInterval(()=>{},1000);`;
    const ownerProgram = `import {spawn} from 'node:child_process';import {stopOwnedChild} from ${JSON.stringify(moduleUrl)};const owned=spawn(process.execPath,['-e',${JSON.stringify(parent)}],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});owned.once('message',tree=>process.send({parent:owned.pid,child:tree.child}));process.once('exit',()=>stopOwnedChild(owned));process.once('message',()=>process.exit(0));`;
    const owner = spawn(process.execPath, ['--input-type=module', '-e', ownerProgram], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    t.after(() => stopOwnedChild(owner));
    const [tree] = await once(owner, 'message');
    assert.equal(isAlive(tree.parent), true);
    assert.equal(isAlive(tree.child), true);
    const exited = once(owner, 'exit');
    owner.send('exit');
    const [code] = await exited;
    assert.equal(code, 0);
    await Promise.all([tree.parent, tree.child].map(waitGone));
  }
);
