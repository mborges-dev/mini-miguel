#!/bin/bash
# notify.sh — Notificação no desktop macOS, respeitando o modo "Não Perturbar" (DND).
#
# O que faz:
#   - Lê a regra de DND em config/dnd.conf (primeira linha não-comentário e não-vazia).
#   - Regista SEMPRE a mensagem em data/pending.log (historial).
#   - Se NÃO estiver em DND, mostra também uma notificação nativa (osascript).
#
# Regras de DND:
#   OFF            → silêncio total
#   HH:MM-HH:MM    → janela de silêncio (suporta atravessar a meia-noite)
#   (vazio)        → notificar sempre
#
# Uso:      notify.sh <titulo> <mensagem>
# Exemplo:  notify.sh "Stripe" "Uso Stripe ou MBWay para pagamentos?"
set -euo pipefail

MM_HOME="${MM_HOME:-$HOME/mini-miguel}"
CONF="$MM_HOME/config/dnd.conf"
DATA="$MM_HOME/data"
LOG="$DATA/pending.log"

if [[ $# -lt 2 ]]; then
  echo "Erro: uso: notify.sh <titulo> <mensagem>" >&2
  exit 1
fi

title="$1"; shift
msg="$*"

mkdir -p "$DATA"

# --- Lê a regra ativa: primeira linha que não é comentário (#) nem vazia ---
rule=""
if [[ -f "$CONF" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    trimmed="${line#"${line%%[![:space:]]*}"}"     # remove espaços à esquerda
    [[ -z "$trimmed" ]] && continue
    [[ "$trimmed" == \#* ]] && continue
    rule="${trimmed%"${trimmed##*[![:space:]]}"}"  # remove espaços à direita
    break
  done < "$CONF"
fi

# --- Está em DND agora? (in_dnd=0 → sim; in_dnd=1 → não) ---
in_dnd=1
case "$rule" in
  "")        in_dnd=1 ;;
  OFF|off)   in_dnd=0 ;;
  *-*)
    start="${rule%-*}"; end="${rule#*-}"
    sh="${start%:*}"; sm="${start#*:}"
    eh="${end%:*}";   em="${end#*:}"
    now_min=$(( 10#$(date +%H) * 60 + 10#$(date +%M) ))
    start_min=$(( 10#$sh * 60 + 10#$sm ))
    end_min=$(( 10#$eh * 60 + 10#$em ))
    if (( start_min <= end_min )); then
      (( now_min >= start_min && now_min < end_min )) && in_dnd=0
    else
      # janela atravessa a meia-noite (ex.: 22:00-09:00)
      (( now_min >= start_min || now_min < end_min )) && in_dnd=0
    fi
    ;;
  *) in_dnd=1 ;;   # regra desconhecida → por segurança, notifica
esac

# --- Regista sempre no log ---
stamp="$(date '+%Y-%m-%d %H:%M')"
printf '[%s] [%s] %s\n' "$stamp" "$title" "$msg" >> "$LOG"

# --- Notifica se não estiver em DND ---
if (( in_dnd == 0 )); then
  echo "🔕 Em 'Não Perturbar' (${rule}). Mensagem guardada em pending.log."
else
  if command -v osascript >/dev/null 2>&1; then
    a_msg="${msg//\"/\\\"}"        # escapa aspas para o AppleScript
    a_title="${title//\"/\\\"}"
    osascript -e "display notification \"$a_msg\" with title \"Mini-Miguel — $a_title\" sound name \"Glass\"" || true
  else
    echo "Aviso: osascript indisponível; mensagem apenas registada no log." >&2
  fi
  echo "🔔 Notificado: [$title] $msg"
fi
