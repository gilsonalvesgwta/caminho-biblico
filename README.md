# O Caminho Bíblico do Dinheiro: Desafio de 7 Dias (plataforma)

App do aluno (PWA instalável no celular), painel administrativo e integração com a Greenn, num único serviço.

- **App do aluno**: `https://app.seudominio.com.br`
- **Painel**: `https://app.seudominio.com.br/admin`
- **Webhook da Greenn**: `https://app.seudominio.com.br/api/webhooks/greenn/<token>` (a URL completa aparece em Painel › Greenn e integrações)

Sem dependências externas: roda com Node.js 22.13+ e o SQLite embutido do próprio Node. Não precisa de `npm install`.

---

## 1. Subir na VPS Wtatechor3 (Docker Swarm + Traefik + Portainer)

Esta VPS usa Traefik (HTTPS automático) e stacks no Swarm. Siga este caminho:

```bash
# na VPS, como root
mkdir -p /opt/caminho-biblico && cd /opt/caminho-biblico
unzip -o /home/ubuntu/caminho-biblico-app.zip && cp -r caminho-biblico-app/. . && rm -rf caminho-biblico-app
docker build -t caminho-biblico:latest .
```

Depois, no Portainer: **Stacks › Add stack**, nome `caminho`, cole `deploy/stack-portainer.yml` (troque e-mail e senha do admin) e clique em **Deploy the stack**. O Traefik gera o certificado sozinho para `caminho.wtatech.com.br`.

Para atualizar: `bash /opt/caminho-biblico/deploy/atualizar.sh`. O script baixa do GitHub, monta a imagem `latest`, faz backup do banco e reinicia o serviço. Os dados ficam no volume `caminho_caminho_data` e não se perdem.

## 1b. Outras VPS (Docker Compose ou systemd)

### Opção A: Docker (recomendado)

```bash
# 1) copie a pasta para a VPS
scp -r caminho-biblico-app root@SUA_VPS:/opt/caminho-biblico
ssh root@SUA_VPS
cd /opt/caminho-biblico

# 2) configure
cp .env.example .env
nano .env          # APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD

# 3) suba
docker compose up -d --build
docker compose logs -f   # deve aparecer "[ok] ... (porta 3100)"
```

O container só escuta em `127.0.0.1:3100`. Ele não conflita com o WTA CRM nem com o opcoes.wtatech, desde que a porta 3100 esteja livre (se não estiver, troque `PORT` no `.env` e a porta no `docker-compose.yml`).

### Opção B: systemd (sem Docker)

```bash
node -v   # precisa ser 22.13 ou maior
sudo cp -r caminho-biblico-app /opt/caminho-biblico && cd /opt/caminho-biblico
cp .env.example .env && nano .env
sudo chown -R www-data:www-data /opt/caminho-biblico
sudo cp deploy/caminho-biblico.service /etc/systemd/system/
sudo systemctl enable --now caminho-biblico
```

### Domínio e HTTPS (Nginx que já existe na VPS)

1. No DNS, crie um registro **A** `app` apontando para o IP da VPS.
2. `sudo cp deploy/nginx.conf /etc/nginx/sites-available/caminho-biblico`, troque o `server_name`.
3. `sudo ln -s /etc/nginx/sites-available/caminho-biblico /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`
4. `sudo certbot --nginx -d app.seudominio.com.br`

### Backup diário

```bash
# crontab -e   (todo dia às 3h; mantém 14 cópias em data/backups)
0 3 * * * cd /opt/caminho-biblico && docker compose exec -T caminho-biblico node --no-warnings scripts/backup.js >> /var/log/caminho-biblico-backup.log 2>&1
```

Copie `data/backups` para fora da VPS (S3, Backblaze, Google Drive via rclone). **O arquivo `data/app.db` é o seu negócio inteiro.**

---

## 2. Configurar (tudo pelo painel)

1. **Entre no painel** com o `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env`.
2. **Configurações › E-mail**: escolha Resend ou Brevo (ou SMTP), informe a chave e o remetente do seu domínio e clique em *Enviar e-mail de teste*. Enquanto estiver em "Modo teste", nenhum e-mail sai (eles só aparecem no log).
3. **Conteúdo › Desafio › Configurar produto**: em *IDs do produto na Greenn*, coloque o número do produto (aparece na URL de edição do produto na Greenn). Faça o mesmo no produto *Guia rápido: Casa em Ordem* com o ID do order bump.
4. **Conteúdo › cada dia**: cole os links do Vídeo 1 (aula) e do Vídeo 2 (prática). Aceita YouTube, Vimeo, Panda Video, Bunny Stream, Wistia, VTurb ou MP4.
5. **Greenn e integrações**: copie a URL do webhook. Na Greenn: *Produto › Conteúdos › Adicionar Conteúdo › Sistema Externo › Webhook*, cole a URL e marque: venda paga, reembolso, chargeback, recusada, aguardando pagamento e checkout abandonado.
6. **Teste**: use *Simular uma compra* com o seu e-mail. Você recebe o link de acesso, cria a senha e entra no Dia 1.
7. **Configurações › Aula ao vivo**: dia da semana, horário e link (o convite aparece no Dia 7 e nos resultados, sempre com a próxima data).
8. **Equipe**: crie acessos para o time (Suporte, Administrador, Leitura).

---

## 3. Como a liberação funciona

- Pagamento aprovado na Greenn → webhook → cadastro do aluno + inscrição → e-mail com link para criar a senha (vale 72h; depois o aluno usa "Primeiro acesso / esqueci a senha").
- **Dia 1 libera na hora.** Cada dia seguinte libera **24 horas depois que o aluno conclui o anterior** (configurável em horas por produto). Para concluir, o aluno precisa salvar a atividade do dia.
- Quando um dia libera, o aluno recebe o e-mail "Dia X liberado" com a mensagem do roteiro, e a plataforma dispara o evento `day.released` com o texto pronto do WhatsApp.
- Reembolso ou chargeback → acesso removido automaticamente (o bônus só sai se o reembolso for dele).
- O suporte pode, no perfil do aluno, **reenviar o link** (e copiar para mandar no WhatsApp), **liberar o próximo dia agora**, liberar/remover acessos e bloquear.

---

## 4. Eventos de saída (WTA CRM, n8n, Make)

Em *Greenn e integrações › Eventos de saída*, informe a URL do seu CRM/automação e um segredo. Cada evento chega como `POST` JSON:

```json
{ "event": "day.released", "id": 42, "sent_at": "2026-11-06T09:00:00Z",
  "data": { "user": { "name": "Maria", "email": "...", "phone": "+55..." }, "day": 2,
            "title": "O altar do coração", "link": "https://app.../dia/2",
            "whatsapp_message": "Maria, Dia 2 liberado! ..." } }
```

Cabeçalho `X-PB-Signature: sha256=<HMAC do corpo com o seu segredo>`. Se o destino cair, a plataforma tenta de novo (até 8 vezes, com espera crescente).

| Evento | Quando |
|---|---|
| `user.created` | novo aluno |
| `enrollment.activated` / `enrollment.revoked` | acesso liberado / removido |
| `day.released` | dia liberado (com a mensagem de WhatsApp pronta) |
| `day.completed` | aluno concluiu um dia |
| `checkpoint.saved` | Checkpoint 1 (Dia 4) preenchido |
| `live.optin` | aluno disse "Sim" para a aula ao vivo (Dia 7), com fase e score |
| `checkout.abandoned`, `sale.waiting_payment`, `sale.refused` | recuperação de vendas |

---

## 5. Manutenção

```bash
docker compose logs -f                                # logs
docker compose up -d --build                          # atualizar depois de trocar os arquivos
docker compose exec caminho-biblico node --no-warnings scripts/create-admin.js email@x.com "NovaSenha123" "Nome" owner   # recuperar acesso ao painel
```

Teste de webhook pela linha de comando:

```bash
node --no-warnings scripts/test-webhook.js "https://app.../api/webhooks/greenn/TOKEN" 123456 voce@email.com paid
```

## 6. Estrutura

```
server.js                 servidor HTTP, rotas, agenda (liberações, fila de eventos)
src/db.js                 SQLite, migrações, configurações
src/greenn.js             processamento do webhook da Greenn (idempotente, reprocessável)
src/services.js           alunos, acessos, liberação dos dias, resumos, aula ao vivo
src/routes-app.js         API do aluno
src/routes-admin.js       API do painel (papéis: owner, admin, support, viewer)
src/mailer.js             e-mail (Resend, Brevo, SMTP) e modelos
src/events.js             eventos de saída com fila e retentativa
src/content-seed.js       conteúdo inicial dos 7 dias (do Roteiro Mestre)
public/shared/calc.js     TODAS as regras de cálculo (mesmo código no app e no servidor)
public/app/               app do aluno (PWA)
public/admin/             painel
```
