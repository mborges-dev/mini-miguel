#!/bin/bash
# review-pending.sh — Lê as perguntas/mensagens acumuladas em data/pending.log.
#
# O que faz:
#   Sem argumento mostra tudo; "today" filtra as de hoje; "clear" apaga o log
#   (com confirmação interativa).
#
# Uso:      review-pending.sh            (mostra tudo)
#           review-pending.sh today      (só as de hoje)
#           review-pending.sh clear      (apaga, com confirmação)
set -euo pipefail

MM_HOME="${MM_HOME:-$HOME/mini-miguel}"
LOG="$MM_HOME/data/pending.log"
LAST_REVIEWED="$MM_HOME/data/last-reviewed.txt"

# Marca "agora" como o momento da última revisão (o badge do avatar usa isto).
mark_reviewed() {
  mkdir -p "$MM_HOME/data"
  date +%s > "$LAST_REVIEWED"
}

mode="${1:-all}"

if [[ "$mode" != "clear" && ! -f "$LOG" ]]; then
  echo "Inbox vazia (ainda não existe $LOG)."
  exit 0
fi

case "$mode" in
  all)
    echo "═══ Inbox — pending.log ═══"
    cat "$LOG"
    mark_reviewed
    ;;
  today)
    today="$(date '+%Y-%m-%d')"
    echo "═══ Inbox — hoje (${today}) ═══"
    grep -F "[${today}" "$LOG" || echo "(nada hoje)"
    mark_reviewed
    ;;
  clear)
    if [[ ! -f "$LOG" ]]; then
      echo "Nada para limpar (inbox já vazia)."
      exit 0
    fi
    read -r -p "Apagar TODO o pending.log? [s/N] " ans
    case "$ans" in
      s|S|sim|Sim) : > "$LOG"; echo "Inbox limpa." ;;
      *) echo "Cancelado." ;;
    esac
    mark_reviewed
    ;;
  *)
    echo "Erro: argumento inválido '$mode'. Use: (sem args) | today | clear" >&2
    exit 1
    ;;
esac
