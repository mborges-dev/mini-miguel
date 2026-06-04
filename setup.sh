#!/bin/bash
# setup.sh — Instalador idempotente do Mini-Miguel.
#
# Pode correr várias vezes sem partir nada:
#   - cria a estrutura de pastas (mkdir -p);
#   - garante que scripts/mm/setup ficam executáveis (chmod);
#   - cria config/ e data/ por defeito APENAS se não existirem (preserva edits);
#   - oferece adicionar a alias 'mm' ao teu shell rc;
#   - verifica dependências (tmux, claude, osascript).
#
# Nota de design: os scripts são a "fonte canónica" e vivem em $MM_HOME/scripts.
# Como não há árvore-fonte separada, "copiar scripts" resume-se a garantir
# presença + permissões de execução (não há sobre-escrita destrutiva).
set -euo pipefail

MM_HOME="${MM_HOME:-$HOME/mini-miguel}"

echo "── Setup do Mini-Miguel em ${MM_HOME} ──"

# 1. Estrutura de pastas
mkdir -p "$MM_HOME"/config/projects "$MM_HOME"/scripts "$MM_HOME"/data "$MM_HOME"/avatar

# 2 + 4. Scripts/mm/setup sempre executáveis
for f in "$MM_HOME"/scripts/*.sh "$MM_HOME/mm" "$MM_HOME/setup.sh"; do
  [[ -f "$f" ]] && chmod +x "$f"
done
echo "[ok] scripts e CLI marcados como executáveis"

# Avisa se faltar algum script esperado
for s in start-agent tell notify set-state review-pending watch-agent; do
  [[ -f "$MM_HOME/scripts/$s.sh" ]] || echo "[AVISO] falta scripts/${s}.sh"
done

# 3. Config + data por defeito — só se NÃO existirem
write_if_missing() {  # <caminho>  (conteúdo via heredoc no stdin)
  local path="$1"
  if [[ -e "$path" ]]; then
    echo "[skip] $(basename "$path") (já existe — preservado)"
    cat > /dev/null     # consome o heredoc para não sobrar no stdin
  else
    cat > "$path"
    echo "[novo] $path"
  fi
}

write_if_missing "$MM_HOME/config/MINI-MIGUEL.md" <<'EOF'
# MINI-MIGUEL.md

(Será preenchido com a personalidade no próximo passo.)
EOF

write_if_missing "$MM_HOME/config/dnd.conf" <<'EOF'
# dnd.conf — Regras de "Não Perturbar"
# A primeira linha não-comentário é a regra ativa.
# Valores: OFF (silêncio total) | HH:MM-HH:MM | vazio (sempre notificar)

22:00-09:00
EOF

write_if_missing "$MM_HOME/data/outreach.md" <<'EOF'
# outreach.md — Fila de leads / contactos pendentes

Cada lead é uma checkbox: `- [ ]` pendente, `- [x]` feito.
(Será preenchido no próximo passo.)
EOF

write_if_missing "$MM_HOME/data/IDEAS.md" <<'EOF'
# IDEAS.md — Ideias adiadas

Cada ideia começa com um cabeçalho `### `.
(Será preenchido no próximo passo.)
EOF

write_if_missing "$MM_HOME/data/decisions.md" <<'EOF'
# decisions.md — Decisões one-shot

Registo de decisões tomadas uma única vez (para o agente não voltar a perguntar).
(Será preenchido no próximo passo.)
EOF

# 5. Alias 'mm' no shell rc
echo
case "${SHELL:-}" in
  */zsh)  rc="$HOME/.zshrc" ;;
  */bash) rc="$HOME/.bash_profile" ;;
  *)      rc="$HOME/.zshrc" ;;   # default no macOS moderno
esac

if grep -qs "alias mm=" "$rc" 2>/dev/null; then
  echo "[ok] alias 'mm' já existe em $rc"
else
  read -r -p "Adicionar a alias 'mm' a $rc? [S/n] " ans
  case "$ans" in
    n|N|nao|Nao|não|Não)
      echo "Sem alias. Podes correr diretamente: $MM_HOME/mm"
      ;;
    *)
      printf '\nalias mm="$HOME/mini-miguel/mm"\n' >> "$rc"
      echo "[novo] alias 'mm' adicionada a $rc"
      echo "   → faz:  source $rc   (ou abre um novo terminal)"
      ;;
  esac
fi

# 6. Dependências
echo
echo "Dependências:"
for dep in tmux claude osascript; do
  if command -v "$dep" >/dev/null 2>&1; then
    echo "  [ok]   $dep"
  else
    echo "  [MISS] $dep"
  fi
done

# 7. Próximos passos
echo
echo "── Pronto! Próximos passos ──"
echo "  1) Ativa a CLI:   source $rc   (ou abre um novo terminal)"
echo "  2) Copia um CLAUDE.md para a raiz de cada projeto que queiras automatizar"
echo "  3) Lança o primeiro agente:   mm new <nome> <pasta_projeto>"
echo
echo "  Ajuda completa:   mm help"
