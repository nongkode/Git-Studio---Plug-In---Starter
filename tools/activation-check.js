// Activation smoke test without VS Code: loads extension.js with a stubbed
// `vscode` module (every property/call returns another stub) and runs
// activate(). Catches typos, missing functions and load-time crashes.
// Usage: node tools/activation-check.js            (from the repo root)
const Module = require('module');
const path = require('path');
function mk(name, isCall) {
  const f = function () { return mk(name + '()', true); };
  return new Proxy(f, {
    get(t, k) {
      if (k === 'then') return isCall ? (res) => Promise.resolve(undefined).then(res) : undefined;
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'length') return 0;
      if (k === 'workspaceFolders' || k === 'all' || k === 'repositories') return [];
      if (k === 'fsPath' || k === 'scheme') return '';
      return mk(name + '.' + String(k));
    },
    construct() { return mk('new ' + name); },
    apply() { return mk(name + '()', true); },
  });
}
const stub = mk('vscode');
const orig = Module._load;
Module._load = function (req, ...rest) { return req === 'vscode' ? stub : orig.call(this, req, ...rest); };
process.on('unhandledRejection', e => { console.log('UNHANDLED', e && e.stack || e); process.exitCode = 1; });
const dir = path.resolve(process.argv[2] || '.');
const ext = require(path.join(dir, 'extension.js'));
const mem = () => { const m = new Map(); return { get: k => m.get(k), update: (k, v) => { m.set(k, v); return Promise.resolve(); }, keys: () => [...m.keys()] }; };
const ctx = { subscriptions: [], globalState: mem(), workspaceState: mem(), extensionPath: dir,
  extensionUri: { fsPath: dir }, asAbsolutePath: p => path.join(dir, p) };
Promise.resolve(ext.activate(ctx)).then(
  () => { console.log('ACTIVATE_OK'); setTimeout(() => process.exit(process.exitCode || 0), 500); },
  e => { console.log('ACTIVATE_FAILED', e && e.stack || e); process.exit(1); });
