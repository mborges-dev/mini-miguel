#!/bin/bash
# watch-agent.sh — Vigia um agente e relança-o se a sessão tmux cair.
#
# O que faz:
#   Em loop, verifica de X em X segundos se a sessão existe; se não, chama o
#   start-agent.sh e dispara uma notificação.
#
# Uso:      watch-agent.sh <sessao> <pasta> [intervalo_segundos=60]
# Exemplo:  watch-agent.sh thefacio ~/projetos/thefacio 60
set -euo pipefail

MM_HOME="${MM_HOME:-$HOME/mini-miguel}"
SCRIPTS="$MM_HOME/scripts"

if [[ $# -lt 2 ]]; then
  echo "Erro: uso: watch-agent.sh <sessao> <pasta> [intervalo=60]" >&2
  exit 1
fi

session="$1"
project="${2/#\~/$HOME}"
interval="${3:-60}"

if ! command -v tmux >/dev/null 2>&1; then
  echo "Erro: o tmux não está instalado." >&2
  exit 1
fi

echo "👁  A vigiar '$session' a cada ${interval}s. Carrega Ctrl-C para parar."
while true; do
  if ! tmux has-session -t "$session" 2>/dev/null; then
    echo "[$(date '+%H:%M:%S')] A sessão '$session' caiu — a relançar…"
    "$SCRIPTS/start-agent.sh" "$session" "$project" || true
    "$SCRIPTS/notify.sh" "Watchdog" "Agente '$session' foi relançado." || true
  fi
  sleep "$interval"
done
