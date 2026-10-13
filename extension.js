// Copyright (c) 2026 Nong Kode. Licensed under the Apache License, Version 2.0 (see LICENSE.txt).
// Git Starter - New Repository and Clone for GitStudio's empty Changes view.
'use strict';
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let gitPath = 'git';
async function initGitPath() {
  try {
    const ext = vscode.extensions.getExtension('vscode.git');
    if (!ext) return;
    const exp = ext.isActive ? ext.exports : await ext.activate();
    const api = exp.getAPI(1);
    if (api && api.git && api.git.path) gitPath = api.git.path;
  } catch (_) { /* keep 'git' */ }
}

function run(args, cwd, onLine, token) {
  return new Promise((resolve) => {
    const p = cp.spawn(gitPath, args, { cwd, windowsHide: true, env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }) });
    let out = '', err = '';
    const feed = (buf, isErr) => {
      const t = buf.toString();
      if (isErr) err += t; else out += t;
      if (onLine) t.split(/\r|\n/).forEach(l => { if (l.trim()) onLine(l); });
    };
    p.stdout.on('data', d => feed(d, false));
    p.stderr.on('data', d => feed(d, true));
    if (token) token.onCancellationRequested(() => { try { p.kill(); } catch (_) { /* gone */ } });
    p.on('error', e => resolve({ code: -1, out, err: err + e.message }));
    p.on('close', code => resolve({ code, out, err }));
  });
}

const isEmptyDir = d => { try { return fs.readdirSync(d).length === 0; } catch (_) { return false; } };
const hasGit = d => fs.existsSync(path.join(d, '.git'));
const openFolder = () => (vscode.workspace.workspaceFolders || [])[0];

// ---------------------------------------------------------------------------
// New Repository
// ---------------------------------------------------------------------------
async function newRepo() {
  let dir;
  const ws = openFolder();
  if (ws && !hasGit(ws.uri.fsPath)) {
    const ok = await vscode.window.showInformationMessage(
      `Create a Git repository in "${ws.uri.fsPath}"?`, { modal: true }, 'Create', 'Choose another folder...');
    if (!ok) return;
    if (ok === 'Create') dir = ws.uri.fsPath;
  }
  if (!dir) {
    const pick = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Create repository here' });
    if (!pick || !pick.length) return;
    dir = pick[0].fsPath;
    if (hasGit(dir)) {
      const open = await vscode.window.showWarningMessage(`"${dir}" is already a Git repository.`, 'Open it');
      if (open) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dir));
      return;
    }
  }
  const r = await run(['init'], dir);
  if (r.code !== 0) return vscode.window.showErrorMessage('git init failed: ' + (r.err || r.out).trim());
  // A TIA Portal project in the folder: TIA Portal Tools can add its Git settings.
  const tia = fs.readdirSync(dir).some(n => /\.ap\d\d$/i.test(n));
  if (tia && (await vscode.commands.getCommands(true)).includes('tiaTools.setupGit')) {
    const s = await vscode.window.showInformationMessage(
      'This folder has a TIA Portal project. Add the TIA Portal Tools Git settings (.gitignore, readable diffs)?', 'Yes', 'No');
    if (s === 'Yes') { try { await vscode.commands.executeCommand('tiaTools.setupGit', vscode.Uri.file(dir)); } catch (_) { /* optional */ } }
  }
  if (!ws || path.resolve(ws.uri.fsPath).toLowerCase() !== path.resolve(dir).toLowerCase()) {
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dir));
  } else {
    vscode.window.showInformationMessage(`Git repository created in ${dir}.`);
    refreshGitStudio(dir);
  }
}

function refreshGitStudio(dir) {
  try {
    const gs = vscode.extensions.getExtension('gitstudio.gitstudio');
    if (gs && gs.isActive && gs.exports && gs.exports.actions) gs.exports.actions.refresh();
  } catch (_) { /* optional */ }
  // Tell VS Code's Git about the new repository. (git.refresh would show
  // "There are no available repositories" while Git has not seen it yet.)
  if (dir) vscode.commands.executeCommand('git.openRepository', dir).then(undefined, () => {});
}

// ---------------------------------------------------------------------------
// Clone (webview form)
// ---------------------------------------------------------------------------
const GIT_URL = /^(https?:\/\/\S+|git@[\w.-]+:[\w./~-]+|ssh:\/\/\S+)$/i;
function repoNameOf(url) {
  const m = /([^/:]+?)(\.git)?\/?$/.exec((url || '').trim());
  return m ? m[1] : 'repository';
}

let panel = null;
async function clone() {
  let clip = '';
  try { clip = (await vscode.env.clipboard.readText()).trim(); } catch (_) { /* none */ }
  const url = GIT_URL.test(clip) && !clip.includes('\n') ? clip : '';
  const ws = openFolder();
  // where: the open folder itself when it is empty, else a sub-folder of it, else ask later
  let parent = '', intoOpen = false;
  if (ws && !hasGit(ws.uri.fsPath)) {
    if (isEmptyDir(ws.uri.fsPath)) { parent = path.dirname(ws.uri.fsPath); intoOpen = true; } else parent = ws.uri.fsPath;
  }
  const init = {
    url,
    parent,
    name: intoOpen ? path.basename(ws.uri.fsPath) : (url ? repoNameOf(url) : ''),
    intoOpen,
    openFolder: ws ? ws.uri.fsPath : '',
  };
  if (panel) { panel.reveal(); panel.webview.postMessage({ type: 'init', data: init }); return; }
  panel = vscode.window.createWebviewPanel('gitStarter.clone', 'Clone Repository', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  panel.onDidDispose(() => { panel = null; });
  const nonce = crypto.randomBytes(16).toString('hex');
  panel.webview.html = cloneHtml(nonce, panel.webview.cspSource);
  let cts = null;
  panel.webview.onDidReceiveMessage(async m => {
    const post = x => panel && panel.webview.postMessage(x);
    if (m.type === 'ready') post({ type: 'init', data: init });
    else if (m.type === 'browse') {
      const pick = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Clone into this folder', defaultUri: m.parent ? vscode.Uri.file(m.parent) : undefined });
      if (pick && pick.length) post({ type: 'parent', value: pick[0].fsPath });
    } else if (m.type === 'paste') {
      let t = '';
      try { t = (await vscode.env.clipboard.readText()).trim(); } catch (_) { /* none */ }
      post({ type: 'url', value: t, name: repoNameOf(t) });
    } else if (m.type === 'branches') {
      post({ type: 'branchesBusy' });
      const r = await run(['ls-remote', '--heads', '--symref', m.url, 'HEAD', 'refs/heads/*'], undefined);
      if (r.code !== 0) { post({ type: 'branches', error: (r.err || 'cannot read the repository').trim().split('\n').slice(-2).join(' ') }); return; }
      let def = '';
      const list = [];
      for (const l of r.out.split('\n')) {
        const sym = /^ref: refs\/heads\/(\S+)\s+HEAD/.exec(l);
        if (sym) def = sym[1];
        const h = /^[0-9a-f]+\s+refs\/heads\/(.+)$/.exec(l);
        if (h) list.push(h[1]);
      }
      post({ type: 'branches', list, def });
    } else if (m.type === 'cancel') {
      if (cts) cts.cancel(); else panel.dispose();
    } else if (m.type === 'clone') {
      const o = m.options;
      const target = path.join(o.parent, o.name);
      if (fs.existsSync(target) && !isEmptyDir(target)) { post({ type: 'done', ok: false, error: `"${target}" already exists and is not empty.` }); return; }
      const args = ['clone', '--progress'];
      if (o.branch) args.push('--branch', o.branch);
      if (o.single) args.push('--single-branch');
      if (o.depth > 0) args.push('--depth', String(o.depth));
      if (o.submodules) args.push('--recurse-submodules');
      if (o.noCheckout) args.push('--no-checkout');
      args.push('--', o.url, target);
      post({ type: 'log', line: '> git ' + args.join(' ') });
      cts = new vscode.CancellationTokenSource();
      const r = await run(args, o.parent, line => post({ type: 'log', line }), cts.token);
      const cancelled = cts.token.isCancellationRequested;
      cts.dispose(); cts = null;
      if (r.code !== 0) { post({ type: 'done', ok: false, error: cancelled ? 'Cancelled.' : (r.err || '').trim().split('\n').slice(-3).join('\n') }); return; }
      post({ type: 'done', ok: true, target });
      const uri = vscode.Uri.file(target);
      if (o.open === 'same') await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
      else if (o.open === 'new') await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
      else if (o.open === 'add') { vscode.workspace.updateWorkspaceFolders((vscode.workspace.workspaceFolders || []).length, 0, { uri }); refreshGitStudio(uri.fsPath); }
    }
  });
}

function cloneHtml(nonce, csp) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 16px 22px; max-width: 760px; }
  h2 { font-weight: 600; margin: 0 0 14px; }
  .row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
  .row label.t { font-weight: 600; }
  .line { display: flex; gap: 6px; align-items: center; }
  input[type=text], input[type=number], select { flex: 1; padding: 4px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
  input[type=number] { flex: 0 0 80px; }
  button { padding: 4px 12px; border: none; cursor: pointer; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button:disabled { opacity: .5; cursor: default; }
  .hint { opacity: .75; font-size: 90%; }
  .opts { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; align-items: center; }
  .foot { display: flex; gap: 8px; margin-top: 16px; }
  pre { background: var(--vscode-textCodeBlock-background); padding: 8px; max-height: 260px; overflow: auto; white-space: pre-wrap; font-size: 90%; }
  .err { color: var(--vscode-errorForeground); }
  .ok { color: var(--vscode-testing-iconPassed, #3fb950); }
  .hide { display: none; }
</style></head><body>
<h2>Clone Repository</h2>
<div class="row"><label class="t" for="url">Repository link</label>
  <div class="line"><input type="text" id="url" placeholder="https://github.com/owner/repo.git"><button id="paste">Paste</button></div></div>
<div class="row"><label class="t" for="parent">Clone into folder</label>
  <div class="line"><input type="text" id="parent"><button id="browse">Browse...</button></div></div>
<div class="row"><label class="t" for="name">New folder name</label>
  <div class="line"><input type="text" id="name"></div>
  <span class="hint" id="target"></span></div>
<div class="row"><label class="t">Branches</label>
  <div class="opts">
    <label><input type="radio" name="br" value="all" checked> All branches</label><span class="hint">normal clone, default branch checked out</span>
    <label><input type="radio" name="br" value="one"> One branch</label>
    <div class="line"><select id="branch" disabled><option value="">(load the list)</option></select><button id="load">Load branches</button></div>
  </div><span class="hint" id="brmsg"></span></div>
<div class="row"><label class="t">Options</label>
  <div class="opts">
    <label><input type="checkbox" id="shallow"> Shallow (history depth)</label><div class="line"><input type="number" id="depth" min="1" value="1" disabled><span class="hint">commits</span></div>
    <label><input type="checkbox" id="subs"> Submodules</label><span class="hint">also clone submodules (--recurse-submodules)</span>
    <label><input type="checkbox" id="nocheck"> No checkout</label><span class="hint">download only, no working files</span>
  </div></div>
<div class="row"><label class="t" for="open">After cloning</label>
  <div class="line"><select id="open">
    <option value="same">Open in this window</option>
    <option value="new">Open in a new window</option>
    <option value="add">Add to this workspace</option>
    <option value="none">Do not open</option></select></div></div>
<div class="foot"><button class="primary" id="go">Clone</button><button id="cancel">Cancel</button></div>
<pre id="log" class="hide"></pre>
<div id="result"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  let nameTouched = false, sep = '\\\\', running = false;
  function nameOf(u) { const m = /([^/:]+?)(\\.git)?\\/?$/.exec((u || '').trim()); return m ? m[1] : ''; }
  function showTarget() { const p = $('parent').value.trim(), n = $('name').value.trim(); $('target').textContent = p && n ? 'Will create: ' + p.replace(/[\\\\/]$/, '') + sep + n : ''; }
  function br() { return document.querySelector('input[name=br]:checked').value; }
  $('url').addEventListener('input', () => { if (!nameTouched) $('name').value = nameOf($('url').value); showTarget(); });
  $('name').addEventListener('input', () => { nameTouched = true; showTarget(); });
  $('parent').addEventListener('input', showTarget);
  $('paste').addEventListener('click', () => vscode.postMessage({ type: 'paste' }));
  $('browse').addEventListener('click', () => vscode.postMessage({ type: 'browse', parent: $('parent').value }));
  $('load').addEventListener('click', () => { if ($('url').value.trim()) vscode.postMessage({ type: 'branches', url: $('url').value.trim() }); });
  document.querySelectorAll('input[name=br]').forEach(r => r.addEventListener('change', () => { $('branch').disabled = br() !== 'one'; if (br() === 'one' && $('branch').options.length < 2) $('load').click(); }));
  $('shallow').addEventListener('change', () => { $('depth').disabled = !$('shallow').checked; });
  $('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
  $('go').addEventListener('click', () => {
    const url = $('url').value.trim(), parent = $('parent').value.trim(), name = $('name').value.trim();
    $('result').textContent = ''; $('result').className = '';
    if (!url || !parent || !name) { $('result').textContent = 'Fill in the link, the folder and the folder name.'; $('result').className = 'err'; return; }
    if (br() === 'one' && !$('branch').value) { $('result').textContent = 'Load the branches and pick one.'; $('result').className = 'err'; return; }
    running = true; $('go').disabled = true; $('log').textContent = ''; $('log').classList.remove('hide');
    vscode.postMessage({ type: 'clone', options: {
      url, parent, name,
      branch: br() === 'one' ? $('branch').value : '', single: br() === 'one',
      depth: $('shallow').checked ? Math.max(1, parseInt($('depth').value, 10) || 1) : 0,
      submodules: $('subs').checked, noCheckout: $('nocheck').checked, open: $('open').value } });
  });
  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'init') {
      const d = m.data; $('url').value = d.url || ''; $('parent').value = d.parent || ''; $('name').value = d.name || '';
      nameTouched = !!d.intoOpen; sep = (d.parent || d.openFolder || '').indexOf('/') >= 0 && (d.parent || '').indexOf('\\\\') < 0 ? '/' : '\\\\';
      if (d.intoOpen) $('target').textContent = 'The open folder is empty: the repository goes straight into it.';
      showTarget(); if (!d.url) $('url').focus();
    } else if (m.type === 'url') { $('url').value = m.value; if (!nameTouched) $('name').value = m.name; showTarget(); }
    else if (m.type === 'parent') { $('parent').value = m.value; showTarget(); }
    else if (m.type === 'branchesBusy') { $('brmsg').textContent = 'Reading branches...'; }
    else if (m.type === 'branches') {
      const sel = $('branch'); sel.innerHTML = '';
      if (m.error) { $('brmsg').textContent = m.error; return; }
      $('brmsg').textContent = m.list.length + ' branch(es)' + (m.def ? ', default ' + m.def : '');
      m.list.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b + (b === m.def ? '  (default)' : ''); if (b === m.def) o.selected = true; sel.appendChild(o); });
    }
    else if (m.type === 'log') { const l = $('log'); l.textContent += m.line + '\\n'; l.scrollTop = l.scrollHeight; }
    else if (m.type === 'done') {
      running = false; $('go').disabled = false;
      $('result').textContent = m.ok ? 'Cloned to ' + m.target : m.error; $('result').className = m.ok ? 'ok' : 'err';
    }
  });
  vscode.postMessage({ type: 'ready' });
</script></body></html>`;
}

function activate(context) {
  initGitPath();
  context.subscriptions.push(
    vscode.commands.registerCommand('gitStarter.newRepo', newRepo),
    vscode.commands.registerCommand('gitStarter.clone', clone));
}
function deactivate() {}
module.exports = { activate, deactivate };
