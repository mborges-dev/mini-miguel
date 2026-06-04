#!/bin/bash
# set-state.sh — Escreve o estado atual do agente para o avatar consumir.
#
# O que faz:
#   Grava data/state.json com o estado e um timestamp ISO8601 em UTC.
#   O avatar lê este ficheiro periodicamente para reagir (idle/working/asking).
#
# Uso:      set-state.sh <idle|working|asking>
# Exemplo:  set-state.sh working
set -euo pipefail

MM_HOME="${MM_HOME:-$HOME/mini-miguel}"
DATA="$MM_HOME/data"

if [[ $# -ne 1 ]]; then
  echo "Erro: uso: set-state.sh <idle|working|asking>" >&2
  exit 1
fi

state="$1"
case "$state" in
  idle|working|asking) ;;
  *)
    echo "Erro: estado inválido '$state'. Valores válidos: idle | working | asking." >&2
    exit 1
    ;;
esac

mkdir -p "$DATA"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '{"state": "%s", "ts": "%s"}\n' "$state" "$ts" > "$DATA/state.json"
echo "Estado: $state ($ts)"
