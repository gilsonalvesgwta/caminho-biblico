#!/usr/bin/env bash
# Atualiza a plataforma na VPS com um comando:  bash /opt/caminho-biblico/deploy/atualizar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "→ Baixando a versão mais nova do GitHub…"
git pull -q
VERSAO=$(git rev-parse --short HEAD)
echo "→ Montando a imagem (versão $VERSAO)…"
docker build -q -t caminho-biblico:latest -t "caminho-biblico:$VERSAO" . >/dev/null
echo "→ Fazendo backup do banco antes de trocar…"
CID=$(docker ps -q -f name=caminho_app | head -1)
if [ -n "$CID" ]; then docker exec "$CID" node --no-warnings scripts/backup.js || echo "  (aviso: backup não concluído, seguindo mesmo assim)"; fi
echo "→ Reiniciando o serviço com a versão nova…"
docker service update --quiet --force --image caminho-biblico:latest caminho_app >/dev/null
sleep 8
CID=$(docker ps -q -f name=caminho_app | head -1)
if [ -n "$CID" ] && docker exec "$CID" wget -qO- http://127.0.0.1:3100/health >/dev/null 2>&1; then
  echo "✅ Atualizado para a versão $VERSAO e respondendo normalmente."
else
  echo "⚠️  O serviço ainda não respondeu. Veja os logs: docker service logs caminho_app --tail 50"
fi
