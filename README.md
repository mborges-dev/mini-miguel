# Mini-Miguel

A personal AI agent system that runs in the background, acts as an operational double, and knows when to interrupt you — and when not to.

Built around Claude Code and tmux. Each agent is an isolated Claude Code session managed by a Bash CLI (`mm`). A floating Electron desktop app provides a persistent avatar and chat interface.

## Concepts

**Agent session** — a named tmux session running `claude -p` with a project-specific `CLAUDE.md` as context. The `mm` CLI creates, instructs, monitors, and terminates these sessions without requiring you to attach.

**DND mode** — a configurable time window (e.g. `22:00-09:00`) parsed in pure Bash. Agents respect it by queuing notifications instead of interrupting. The rule is stored in a single plain-text file (`config/dnd.conf`).

**Inbox** — agents write pending items to `data/pending.log`. `mm pending` reviews them; `mm pending today` filters to the current day; `mm pending clear` empties the log.

**Avatar** — a floating Electron window with a Three.js 3D avatar, chat interface, and real-time status reflection. Runs independently of the agent sessions.

## Structure

```
mm                        CLI entrypoint (Bash)
setup.sh                  Idempotent installer

config/
  MINI-MIGUEL.md          Agent personality and global rules (fill locally)
  dnd.conf                Active DND rule — one line: OFF | HH:MM-HH:MM | empty
  projects/
    CLAUDE.thefacio.md    Project-specific context for TheFacio agents
    CLAUDE.unreal.md      Project-specific context for UNREAL Performance agents
    CLAUDE.almi.md        Project-specific context for Almi agents

scripts/
  start-agent.sh          Launch a new Claude Code session in tmux
  tell.sh                 Send an instruction to a running session (no attach)
  watch-agent.sh          Attach to a session (alias: mm watch)
  review-pending.sh       View / filter / clear the pending inbox
  set-state.sh            Write key-value state to data/state.json
  notify.sh               Used by agents to push items to the inbox
  start-avatar.sh         Start / stop the Electron avatar app

avatar/
  model.glb               3D avatar model (not committed — add your own)
  desktop-app/
    main.js               Electron main process — window management, IPC
    renderer.js           Three.js scene — avatar, lighting, animation loop
    chat.js               Chat interface logic — sends messages to claude -p
    index.html            Main window shell
    chat.html             Chat overlay window

data/                     Runtime state — gitignored, generated locally
  state.json              Current agent state (active project, focus, etc.)
  pending.log             Agent inbox
  outreach.md             Lead queue (template — fill locally)
  decisions.md            One-shot decisions log (template — fill locally)
  IDEAS.md                Deferred ideas (template — fill locally)
```

## CLI reference

```
mm                                   Dashboard — active agents, inbox, DND status
mm new <name> <project-path>         Launch a new agent in tmux
mm tell <name> "instruction"         Send an instruction without attaching
mm watch <name>                      Attach to an agent session
mm log <name> [N=200]                Show last N lines of a session
mm kill <name>                       Terminate an agent session
mm list                              List active sessions
mm pending [today|clear]             View/filter/clear the inbox
mm dnd [on|off|HH:MM-HH:MM]         Configure DND mode
mm avatar [start|stop]               Toggle the desktop avatar
mm config                            Edit config/MINI-MIGUEL.md
mm setup                             Re-run the installer
mm help                              Full command reference
```

## Setup

**Requirements:** macOS, [Claude Code CLI](https://claude.ai/download), tmux, Node.js (for the avatar)

```bash
# 1. Install dependencies
brew install tmux
brew install node   # if not already present

# 2. Run the installer (idempotent — safe to re-run)
./setup.sh

# 3. Add mm to your PATH
# The installer will offer to add: alias mm="$HOME/mini-miguel/mm"
# Or add it manually to ~/.zshrc / ~/.bashrc

# 4. Fill in your personality file
mm config   # opens config/MINI-MIGUEL.md in $EDITOR
```

## Agent personality

`config/MINI-MIGUEL.md` is the system prompt loaded into every agent session. It defines:
- Global rules (what the agent always/never does)
- Autonomy policy (when to act directly vs. when to ask first)
- Tone and communication style
- DND and notification preferences

This file is gitignored. Copy the template and fill it locally.

## Project contexts

`config/projects/CLAUDE.<project>.md` extends the personality for a specific project. Pass the path when launching an agent:

```bash
mm new thefacio ~/projects/thefacio
# The agent loads MINI-MIGUEL.md + CLAUDE.thefacio.md as context
```

## Avatar

The Electron app runs independently of the agent sessions. It displays a floating 3D avatar and a chat interface that pipes messages to `claude -p` with the same personality context.

```bash
mm avatar start   # launches the desktop app
mm avatar stop    # terminates it
```

The 3D model (`avatar/model.glb`) is not committed. Provide your own `.glb` file or remove the Three.js scene from `renderer.js`.

---


## Notice

This repository is published as a **portfolio showcase** of my work. The code is **not licensed for reuse, redistribution, or modification.** You're welcome to read it, but it is not open source. If you'd like to discuss similar work, [get in touch](mailto:hello@miguelborges.dev).

---

Built by [Miguel Borges](https://miguelborges.dev) · [hello@miguelborges.dev](mailto:hello@miguelborges.dev)