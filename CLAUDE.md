# Git Starter — notes for Claude Code

VS Code extension `nongkode.git-starter`: adds **New Repo** and **Clone**
buttons to the empty ("no repository") Changes view of GitStudio, using the
`gitstudio.actions` extension point of the GitStudio fork
(github.com/nongkode/gitstudio, branch `sinumerik/extension-actions`).
Public repo, Apache-2.0 (so upstream GitStudio may adopt it). Owner: Nong Kode
(nongkode). The owner prefers short answers in Thai.

## Ground rules

- Plain JavaScript (CommonJS), single `extension.js`, **no build step, no npm
  dependencies**. Keep it that way.
- Independent of the other projects: must load and do nothing harmful when
  GitStudio or TIA Portal Tools are missing (all cross-extension calls are
  optional and wrapped in try/catch).

## What it does

- `contributes["gitstudio.actions"]` (see package.json):
  - `gitStarter.newRepo` — slot `noRepo`, when `noRepo`. Confirms, then
    `git init` in the open folder (or asks for a folder). If the folder holds a
    TIA project (`*.apNN`) and the command `tiaTools.setupGit` exists, offers
    it. Afterwards calls `git.openRepository <dir>` (NOT `git.refresh`, which
    shows "There are no available repositories" before Git has seen the repo)
    and GitStudio's `exports.actions.refresh()`.
  - `gitStarter.clone` — slot `noRepo`, when `noRepo` + `clipboardHasGitUrl`
    (GitStudio reads the clipboard only on window focus / view shown). Opens
    a webview form: link, parent folder, folder name, all branches or one
    (branch list via `git ls-remote`), shallow depth, submodules,
    no-checkout, open in same/new window, add to workspace, or don't open. If
    the open folder is empty it clones straight into it.
- `configurationDefaults`: `git.showActionButton` {commit,publish,sync} = false
  (hides VS Code's own big SCM button; GitStudio's view replaces it).

## Check and package

```
node tools/activation-check.js            # must print ACTIVATE_OK
python tools/packgeneric.py . out package.json,README.md,LICENSE.txt,extension.js
```

`packgeneric.py` stamps version `yymmdd.hhmm.0` (Bangkok time) into
package.json and zips only the listed files. Install on Windows with the full
path to code.cmd:
`"C:\Program Files\Microsoft VS Code\bin\code.cmd" --install-extension out\git-starter-<ver>.vsix --force`,
then close and reopen open VS Code windows.

## Status (2026-10-13)

- Tested OK on the owner's PC: New Repo button shows with no repo, creates the
  repo, view switches to the commit state. Clone hides correctly when the
  clipboard has no git link.
- Not yet tested: Clone with a link on the clipboard (copy e.g.
  `https://github.com/nongkode/Git-Studio---Plug-In---Starter.git`, focus the
  VS Code window of an empty folder, click Clone, try each option).

Working source on the owner's PC: `C:\Users\VM\Desktop\0 SINUMEIRK Tools\Git Starter\src`
(pushed here by `push-plugins.bat` next to it).
