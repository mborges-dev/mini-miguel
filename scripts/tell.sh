#!/bin/bash
# tell.sh — Envia uma instrução a um agente em tmux sem fazer attach.
#
# O que faz:
#   Cola a mensagem no prompt da sessão (via set-buffer/paste-buffer, que lida
#   bem com caracteres especiais) e carrega Enter.
#
# Uso:      tell.sh <sessao> <mensagem...>
#           tell.sh <sessao> -          (lê a mensagem do stdin)
# Exemplo:  tell.sh thefacio "corre os testes e faz commit"
#           echo "deploy para staging" | tell.sh thefacio -
set -euo pipefail

if ! command -v tmux >/dev/null 2>&1; then
  echo "Erro: o tmux não está instalado." >&2
  exit 1
fi

list_sessions() {
  echo "Sessões ativas:" >&2
  tmux ls 2>/dev/null >&2 || echo "  (nenhuma)" >&2
}

if [[ $# -lt 1 ]]; then
  echo "Erro: uso: tell.sh <sessao> <mensagem...>" >&2
  list_sessions
  exit 1
fi

session="$1"; shift

if ! tmux has-session -t "$session" 2>/dev/null; then
  echo "Erro: a sessão '$session' não existe." >&2
  list_sessions
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Erro: falta a mensagem a enviar." >&2
  exit 1
fi

if [[ "$1" == "-" ]]; then
  msg="$(cat)"          # mensagem vinda do stdin
else
  msg="$*"              # junta todos os argumentos com espaços
fi

tmux set-buffer -- "$msg"
tmux paste-buffer -t "$session"
tmux send-keys -t "$session" Enter

echo "✉️  Enviado a '$session': $msg"
