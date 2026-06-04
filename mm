#!/bin/bash
# mm — CLI unificada do Mini-Miguel.
#
# Controla agentes Claude Code que correm em sessões tmux: lançar, instruir,
# vigiar, ver logs/inbox, gerir o modo "Não Perturbar", etc.
#
# Variáveis: MM_HOME (default $HOME/mini-miguel) — pode ser sobreposta por env.
# Uso:       mm <subcomando> [argumentos]    ·    mm help    para ver tudo.
set -euo pipefail

MM_HOME="${MM_HOME:-$HOME/mini-miguel}"
SCRIPTS="$MM_HOME/scripts"
CONFIG="$MM_HOME/config"
DATA="$MM_HOME/data"

# ── Cores ANSI (só quando o stdout é um terminal) ───────────────────────────
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RED=$'\033[31m'
else
  BOLD=""; DIM=""; RESET=""; GREEN=""; YELLOW=""; CYAN=""; RED=""
fi

# ── Helpers ─────────────────────────────────────────────────────────────────

# Lê a regra de DND ativa (primeira linha não-comentário e não-vazia).
dnd_rule() {
  local conf="$CONFIG/dnd.conf" line trimmed
  [[ -f "$conf" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    trimmed="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$trimmed" ]] && continue
    [[ "$trimmed" == \#* ]] && continue
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    printf '%s' "$trimmed"
    return 0
  done < "$conf"
}

# Está em DND agora? (0 = sim, 1 = não)
dnd_active() {
  local rule="$1" start end sh sm eh em now start_min end_min
  case "$rule" in
    "")        return 1 ;;
    OFF|off)   return 0 ;;
    *-*)
      start="${rule%-*}"; end="${rule#*-}"
      sh="${start%:*}"; sm="${start#*:}"; eh="${end%:*}"; em="${end#*:}"
      now=$(( 10#$(date +%H) * 60 + 10#$(date +%M) ))
      start_min=$(( 10#$sh * 60 + 10#$sm ))
      end_min=$(( 10#$eh * 60 + 10#$em ))
      if (( start_min <= end_min )); then
        (( now >= start_min && now < end_min )) && return 0 || return 1
      else
        (( now >= start_min || now < end_min )) && return 0 || return 1
      fi
      ;;
    *) return 1 ;;
  esac
}

# Converte um timestamp Unix de criação numa string "há Xh Ym".
human_since() {
  local created="$1" now diff h m
  now=$(date +%s); diff=$(( now - created ))
  (( diff < 0 )) && diff=0
  h=$(( diff / 3600 )); m=$(( (diff % 3600) / 60 ))
  printf 'há %dh %dm' "$h" "$m"
}

require_session() {  # <sessao> <contexto-uso>
  local s="$1" usage="$2"
  if [[ -z "$s" ]]; then
    echo "Erro: falta o nome da sessão. Uso: $usage" >&2
    exit 1
  fi
  if ! command -v tmux >/dev/null 2>&1; then
    echo "Erro: o tmux não está instalado." >&2
    exit 1
  fi
  if ! tmux has-session -t "$s" 2>/dev/null; then
    echo "Erro: a sessão '$s' não existe." >&2
    tmux ls 2>/dev/null || echo "  (nenhum agente ativo)" >&2
    exit 1
  fi
}

# ── Subcomandos ─────────────────────────────────────────────────────────────

cmd_dashboard() {
  echo "${BOLD}${CYAN}Mini-Miguel${RESET}  ${DIM}$(date '+%Y-%m-%d %H:%M')${RESET}"
  echo

  echo "${BOLD}AGENTES ATIVOS${RESET}"
  if command -v tmux >/dev/null 2>&1 && tmux ls >/dev/null 2>&1; then
    local s created
    while IFS= read -r s; do
      [[ -z "$s" ]] && continue
      created=$(tmux display-message -p -t "$s" '#{session_created}' 2>/dev/null || echo 0)
      printf '  %s●%s %s  %s%s%s\n' "$GREEN" "$RESET" "$s" "$DIM" "$(human_since "$created")" "$RESET"
    done < <(tmux ls -F '#{session_name}' 2>/dev/null)
  else
    echo "  ${DIM}(nenhum)${RESET}"
  fi
  echo

  echo "${BOLD}INBOX${RESET}"
  local log="$DATA/pending.log" total today last
  if [[ -f "$log" ]]; then
    total=$(wc -l < "$log" | tr -d ' ')
    today=$(grep -cF "[$(date '+%Y-%m-%d')" "$log" || true)
    last=$(tail -n1 "$log" 2>/dev/null || true)
    printf '  total: %s   hoje: %s\n' "$total" "$today"
    [[ -n "$last" ]] && printf '  %súltima:%s %.80s\n' "$DIM" "$RESET" "$last"
  else
    echo "  ${DIM}vazia${RESET}"
  fi
  echo

  echo "${BOLD}ESTADO${RESET}"
  local rule; rule="$(dnd_rule)"
  if [[ -z "$rule" ]]; then
    printf '  DND: %ssempre disponível%s\n' "$GREEN" "$RESET"
  elif dnd_active "$rule"; then
    printf '  DND: %s%s (ATIVO agora)%s\n' "$YELLOW" "$rule" "$RESET"
  else
    printf '  DND: %s (inativo agora)\n' "$rule"
  fi
  local leads=0 ideas=0
  [[ -f "$DATA/outreach.md" ]] && leads=$(grep -c '^- \[ \]' "$DATA/outreach.md" || true)
  [[ -f "$DATA/IDEAS.md" ]]    && ideas=$(grep -c '^### ' "$DATA/IDEAS.md" || true)
  printf '  leads pendentes: %s   ideias: %s\n' "$leads" "$ideas"
  echo
  echo "${DIM}Sugestões:  mm new <nome> <pasta>   ·   mm pending   ·   mm dnd${RESET}"
}

cmd_new()     { "$SCRIPTS/start-agent.sh" "$@"; }
cmd_tell()    { "$SCRIPTS/tell.sh" "$@"; }
cmd_pending() { "$SCRIPTS/review-pending.sh" "$@"; }

cmd_watch() {
  local s="${1:-}"
  require_session "$s" "mm watch <nome>"
  exec tmux attach -t "$s"
}

cmd_log() {
  local s="${1:-}" n="${2:-200}"
  require_session "$s" "mm log <nome> [N]"
  tmux capture-pane -t "$s" -p -S "-$n"
}

cmd_kill() {
  local s="${1:-}"
  require_session "$s" "mm kill <nome>"
  if tmux kill-session -t "$s" 2>/dev/null; then
    echo "Agente '$s' terminado."
  else
    echo "Erro: não foi possível terminar '$s'." >&2
    exit 1
  fi
}

cmd_list() {
  if command -v tmux >/dev/null 2>&1 && tmux ls 2>/dev/null; then
    :
  else
    echo "Nenhum agente ativo."
  fi
}

cmd_dnd() {
  local arg="${1:-}" conf="$CONFIG/dnd.conf"
  mkdir -p "$CONFIG"
  case "$arg" in
    "")
      local rule; rule="$(dnd_rule)"
      if [[ -z "$rule" ]]; then
        echo "DND: sempre disponível (vazio)."
      elif dnd_active "$rule"; then
        echo "DND: $rule — ${YELLOW}ATIVO agora${RESET}."
      else
        echo "DND: $rule — inativo agora."
      fi
      ;;
    on)    printf 'OFF\n' > "$conf"; echo "DND ligado: silêncio total (OFF)." ;;
    off)   : > "$conf"; echo "DND desligado: sempre disponível." ;;
    *-*)   printf '%s\n' "$arg" > "$conf"; echo "DND: janela $arg definida." ;;
    *)     echo "Erro: uso: mm dnd [on|off|HH:MM-HH:MM]" >&2; exit 1 ;;
  esac
}

cmd_config() {
  mkdir -p "$CONFIG"
  "${EDITOR:-nano}" "$CONFIG/MINI-MIGUEL.md"
}

cmd_setup() { "$MM_HOME/setup.sh" "$@"; }

cmd_avatar() { "$SCRIPTS/start-avatar.sh" "${1:-start}"; }

cmd_help() {
  cat <<EOF
${BOLD}Mini-Miguel — CLI 'mm'${RESET}

${BOLD}USO${RESET}
  mm <subcomando> [argumentos]

${BOLD}SUBCOMANDOS${RESET}
  ${CYAN}dashboard${RESET} (status, s)        Painel geral (default sem argumentos)
  ${CYAN}new${RESET} (start, n) <nome> <pasta>  Lança um agente em tmux
  ${CYAN}tell${RESET} (send, t) <nome> <msg>   Envia instrução ao agente (sem attach)
  ${CYAN}watch${RESET} (attach, w) <nome>      Faz attach à sessão tmux do agente
  ${CYAN}log${RESET} (history) <nome> [N=200]  Mostra as últimas N linhas visíveis
  ${CYAN}kill${RESET} (stop, k) <nome>         Termina o agente
  ${CYAN}list${RESET} (ls, l)                  Lista agentes ativos
  ${CYAN}pending${RESET} (inbox, p) [today|clear]  Vê/limpa a inbox de notificações
  ${CYAN}dnd${RESET} [on|off|HH:MM-HH:MM]      Gere o modo "Não Perturbar"
  ${CYAN}config${RESET} (edit, c)              Edita config/MINI-MIGUEL.md
  ${CYAN}avatar${RESET} [start|stop]           Liga/desliga o avatar desktop
  ${CYAN}setup${RESET}                         Corre o instalador (setup.sh)
  ${CYAN}help${RESET} (-h, --help, h)          Mostra esta ajuda

${BOLD}EXEMPLOS${RESET}
  mm                                  # painel
  mm new thefacio ~/projetos/thefacio
  mm tell thefacio "corre os testes e faz commit"
  mm log thefacio 100
  mm watch thefacio
  mm pending today
  mm dnd 22:00-09:00
  mm kill thefacio
EOF
}

# ── Despacho ────────────────────────────────────────────────────────────────
# Nota: a alias 'h' está atribuída a 'help' (convenção universal); o 'log' usa
# a alias 'history' para evitar a colisão.
if [[ $# -eq 0 ]]; then
  cmd_dashboard
  exit 0
fi

cmd="$1"; shift
case "$cmd" in
  dashboard|status|s) cmd_dashboard "$@" ;;
  new|start|n)        cmd_new "$@" ;;
  tell|send|t)        cmd_tell "$@" ;;
  watch|attach|w)     cmd_watch "$@" ;;
  log|history)        cmd_log "$@" ;;
  kill|stop|k)        cmd_kill "$@" ;;
  list|ls|l)          cmd_list "$@" ;;
  pending|inbox|p)    cmd_pending "$@" ;;
  dnd)                cmd_dnd "$@" ;;
  config|edit|c)      cmd_config "$@" ;;
  avatar)             cmd_avatar "$@" ;;
  setup)              cmd_setup "$@" ;;
  help|-h|--help|h)   cmd_help ;;
  *)
    echo "${RED}Comando inválido: $cmd${RESET}" >&2
    echo >&2
    cmd_help >&2
    exit 1
    ;;
esac
