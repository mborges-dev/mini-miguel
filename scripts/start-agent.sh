#!/bin/bash
# start-agent.sh — Lança um agente Claude Code numa sessão tmux destacada.
#
# O que faz:
#   Cria uma sessão tmux "detached" (sobrevive ao fechar do terminal) na pasta
#   do projeto e arranca o "claude" lá dentro. Verifica pré-requisitos antes.
#
# Uso:      start-agent.sh <nome_sessao> <pasta_projeto>
# Exemplo:  start-agent.sh thefacio ~/projetos/thefacio
set -euo pipefail

MM_HOME="${MM_HOME:-$HOME/mini-miguel}"

if [[ $# -lt 2 ]]; then
  echo "Erro: uso: start-agent.sh <nome_sessao> <pasta_projeto>" >&2
  exit 1
fi

session="$1"
project="${2/#\~/$HOME}"   # resolve um ~/ inicial para $HOME

if ! command -v tmux >/dev/null 2>&1; then
  echo "Erro: o tmux não está instalado. Instala com: brew install tmux" >&2
  exit 1
fi

if [[ ! -d "$project" ]]; then
  echo "Erro: a pasta do projeto não existe: $project" >&2
  exit 1
fi

if [[ ! -f "$MM_HOME/config/MINI-MIGUEL.md" ]]; then
  echo "Aviso: $MM_HOME/config/MINI-MIGUEL.md não encontrado (continuo na mesma)." >&2
fi

if [[ ! -f "$project/CLAUDE.md" ]]; then
  echo "Aviso: não existe $project/CLAUDE.md — o agente arranca sem regras do projeto." >&2
  read -r -p "Continuar mesmo assim? [s/N] " ans
  case "$ans" in
    s|S|sim|Sim) ;;
    *) echo "Cancelado."; exit 1 ;;
  esac
fi

if tmux has-session -t "$session" 2>/dev/null; then
  echo "Já existe uma sessão chamada '$session'."
  echo "  Fazer attach:  tmux attach -t $session    (ou: mm watch $session)"
  exit 0
fi

tmux new-session -d -s "$session" -c "$project"
tmux send-keys -t "$session" "claude" Enter

echo "✅ Agente '$session' lançado em: $project"
echo
echo "  Ver ao vivo:      tmux attach -t $session     (ou: mm watch $session)"
echo "  Sair sem matar:   Ctrl-b  e depois  d"
echo "  Listar sessões:   tmux ls                     (ou: mm list)"
echo "  Matar agente:     tmux kill-session -t $session   (ou: mm kill $session)"
