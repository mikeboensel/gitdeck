# Git graphing / interaction tools — landscape

Reference tools that visualize git history as a graph and/or offer rich git
interactions (branch, merge, rebase, cherry-pick, stash) — the space gitdeck's
commit-history graph draws from. Grouped by form factor. Links are canonical
homepages or source repos.

## Desktop GUI clients
| Tool | Link | Notes |
|---|---|---|
| GitKraken Desktop | https://www.gitkraken.com/ | Polished DAG graph (branch columns + colored topology lines); drag-to-merge/rebase; the reference for the commit-graph + detail-panel pattern. |
| Sourcetree (Atlassian) | https://www.sourcetreeapp.com/ | Free Win/macOS client; branch graph, interactive rebase, submodules. |
| Sublime Merge | https://www.sublimemerge.com/ | Fast native client; commit graph of colored topology lines, "Create branch at commit…" from the node, powerful search. |
| Tower | https://www.git-tower.com/ | Mac/Windows; history graph, undo, drag-and-drop branching, conflict UI. |
| Fork | https://fork.dev/ | Mac/Windows; clean commit graph, interactive rebase, image diffs. |
| GitHub Desktop | https://desktop.github.com/ | Simple history list (no full DAG); PR-centric flow. |
| SmartGit (syntevo) | https://www.syntevo.com/smartgit/ | Cross-platform; graphical log, interactive rebase, Gerrit/PR support. |
| GitUp | https://gitup.co/ · https://github.com/git-up/GitUp | macOS; live, real-time graph you edit directly ("time machine"). |
| Git Extensions | https://gitextensions.github.io/ | Windows; revision graph, shell integration. |
| TortoiseGit | https://tortoisegit.org/ | Windows Explorer shell integration; revision graph. |
| gitg (GNOME) | https://gitlab.gnome.org/GNOME/gitg | Linux/GTK; history graph browser. |
| Git Cola | https://git-cola.github.io/ | Cross-platform Python client; DAG viewer (`git dag`). |

## Bundled with git / classic
| Tool | Link | Notes |
|---|---|---|
| gitk | https://git-scm.com/docs/gitk | Ships with git; the canonical two-pane graph (DAG on top, commit detail below). Yellow dot = HEAD, red dot = uncommitted. |
| git-gui | https://git-scm.com/docs/git-gui | Ships with git; commit-oriented Tk GUI (pairs with gitk). |

## IDE-integrated
| Tool | Link | Notes |
|---|---|---|
| GitLens (VS Code) | https://www.gitkraken.com/gitlens | Commit Graph view: ref rows, rich multi-facet search (commit/message/author/file/code), keyboard nav (F3/⇧F3), focus+context minimap. |
| Git Graph (VS Code, mhutchie) | https://github.com/mhutchie/vscode-git-graph | Popular free extension; interactive graph with per-node actions. |
| VS Code built-in Source Control Graph | https://code.visualstudio.com/docs/sourcecontrol/overview | Native incoming/outgoing commit graph. |
| JetBrains IDEs (Git Log) | https://www.jetbrains.com/help/idea/log-tab.html | Branch/commit graph with filtering, interactive rebase, in IntelliJ/etc. |
| Magit (Emacs) | https://magit.vc/ | Keyboard-driven git porcelain; log graph, staging, rebase. |

## Terminal / TUI
| Tool | Link | Notes |
|---|---|---|
| tig | https://jonas.github.io/tig/ · https://github.com/jonas/tig | ncurses `git log` browser; mirrors `git log --graph` layout. |
| lazygit | https://github.com/jesseduffield/lazygit | TUI with commit graph, staging, rebase, cherry-pick — very interaction-rich. |
| gitui | https://github.com/extrawurst/gitui | Fast Rust TUI; log, diff, stash, blame. |
| serie | https://github.com/lusingander/serie | Rust TUI; renders the graph via terminal image protocols; chrono/topo `--order` toggle. |

## CLI graph renderers / libraries
| Tool | Link | Notes |
|---|---|---|
| git-graph (Rust CLI) | https://github.com/mlange-42/git-graph | Branching-model-aware lane layout (persistence-ranked back-tracing) — the algorithm gitdeck's Tier-2 "branch-aware lanes" would adopt. |
| `git log --graph` | https://git-scm.com/docs/git-log | The built-in ASCII DAG; baseline every tool echoes. |
| gitgraph.js / @gitgraph/react | https://github.com/nicoespeon/gitgraph.js | JS library to *draw* git graphs (API-call oriented). Low maintenance — verify before adopting. |
| d3-dag | https://github.com/erikbrinkman/d3-dag | General DAG layout (Sugiyama/Zherebko/grid); a React Flow layout-engine option. |
| gitamine | https://github.com/pvigier/gitamine | Electron client; author wrote up the commit-graph drawing algorithms (lane assignment, edge straightening). |
| ungit | https://github.com/FredrikNoren/ungit | Web-based interactive graph aimed at teaching git. |

## Web / forge built-in
| Tool | Link | Notes |
|---|---|---|
| GitHub network graph | https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/visualizing-repository-data-with-graphs | Branch/fork network visualization. |
| GitLab repository graph | https://docs.gitlab.com/ee/user/project/repository/ | Commit graph view in-browser. |
| Gitea / Forgejo | https://docs.gitea.com/ · https://forgejo.org/ | Self-hosted forges with a built-in commit graph page (relevant — gitdeck targets Forgejo-compatible forges). |

## Research / novel visualization
| Tool | Link | Notes |
|---|---|---|
| Githru | https://github.com/githru/githru · https://arxiv.org/abs/2009.03115 | Scales large histories via graph reconstruction + clustering + context-preserving squash merge (the Tier-2 "collapse linear runs" idea). |

---
*Compiled 2026-06-26. Tool facts (especially library maintenance status and feature
sets) move quickly — re-verify before relying on any single entry.*
