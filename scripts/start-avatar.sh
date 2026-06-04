#!/bin/bash
# start-avatar.sh — Liga/desliga o avatar desktop do Mini-Miguel (app Electron).
#
# Uso:      start-avatar.sh [start|stop]   (default: start)
# Exemplo:  start-avatar.sh start
set -euo pipefail

MM_HOME="${MM_HOME:-$HOME/mini-miguel}"
APP="$MM_HOME/avatar/desktop-app"
PIDFILE="$MM_HOME/data/avatar.pid"
MARKER="mini-miguel/avatar/desktop-app"   # para identificar o processo

action="${1:-start}"

case "$action" in
  start)
    if ! command -v npm >/dev/null 2>&1; then
      echo "Erro: o npm (Node.js) não está instalado." >&2
      exit 1
    fi
    if [[ ! -d "$APP/node_modules" ]]; then
      echo "Erro: dependências não instaladas." >&2
      echo "  Corre primeiro:  cd \"$APP\" && npm install" >&2
      exit 1
    fi
    if [[ ! -f "$MM_HOME/avatar/model.glb" ]]; then
      echo "Aviso: não existe $MM_HOME/avatar/model.glb — o avatar abre vazio até o colocares lá." >&2
    fi
    if pgrep -f "$MARKER" >/dev/null 2>&1; then
      echo "O avatar já está a correr. (Para reiniciar: $0 stop && $0 start)"
      exit 0
    fi
    mkdir -p "$MM_HOME/data"
    ( cd "$APP" && npm start ) >/dev/null 2>&1 &
    echo $! > "$PIDFILE"
    echo "🟢 Avatar do Mini-Miguel iniciado (PID $(cat "$PIDFILE"))."
    echo "   Arrasta para posicionar · clique-direito para o menu · ⌘⇧M para mostrar/ocultar."
    ;;
  stop)
    killed=0
    if pkill -f "$MARKER" 2>/dev/null; then killed=1; fi
    if [[ -f "$PIDFILE" ]]; then
      kill "$(cat "$PIDFILE")" 2>/dev/null && killed=1 || true
      rm -f "$PIDFILE"
    fi
    if [[ "$killed" -eq 1 ]]; then
      echo "🔴 Avatar terminado."
    else
      echo "O avatar não estava a correr."
    fi
    ;;
  *)
    echo "Erro: uso: start-avatar.sh [start|stop]" >&2
    exit 1
    ;;
esac
