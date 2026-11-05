# O Caminho Bíblico do Dinheiro: Desafio de 7 Dias

## Análise e arquitetura recomendada

## O formato certo para este produto

**Aplicativo web instalável (PWA) + painel no mesmo serviço, na sua VPS.**

| Decisão | Por quê |
|---|---|
| **PWA em vez de app de loja** | O aluno compra e entra no mesmo minuto por um link. Instala na tela inicial (Android e iPhone), sem aprovação da Apple/Google, sem taxa de 15–30% e com atualização instantânea. Para um low ticket de R$ 97 com tráfego frio, cada passo extra derruba a ativação. Se escalar, o mesmo app pode ser empacotado para as lojas depois (Capacitor) sem reescrever. |
| **Plataforma própria em vez de área de membros pronta** | O coração do desafio são as **atividades com cálculo** (Raio-X, sobra real, mapa de dívidas, fase, Casa em Ordem, Plano de Patrimônio, retrato antes × depois). Nenhuma área de membros faz isso, e são esses dados que qualificam o lead para a aula ao vivo e a consultoria de consórcio. |
| **Um serviço, zero dependências** | Node 22 + SQLite embutido. Nada para instalar, nada para quebrar numa atualização de pacote, sobe em 1 minuto na VPS que já existe. |
| **Regras num arquivo só** | `public/shared/calc.js` roda no celular do aluno (cálculo ao vivo) e no servidor (painel, leads, CSV). Mudou a regra, mudou nos dois. |

## Fluxo do negócio que a plataforma sustenta

```
Anúncio → LP → Checkout Greenn (R$ 97 + order bump Guia)
   → webhook → acesso imediato + e-mail
   → Dia 1 (liberado) → conclui → 24h → Dia 2 → … → Dia 7
        Checkpoint 1 (Dia 4): renda, sobra real, dívidas, fase, imóvel, onde mora, família
        Checkpoint 2 (Dia 7): sonhos, quanto direciona/mês, WhatsApp, "quero a aula ao vivo"
   → Lead score 0–100 no painel → aula ao vivo semanal fixa → consultoria (consórcio)
```

O painel transforma o desafio num **gerador de leads qualificados**: filtro por fase, sonho do imóvel, valor que a pessoa pode direcionar por mês, Brasil/exterior e score, com exportação CSV e evento `live.optin` em tempo real para o CRM. Com a capacidade de 5 a 10 consultorias por dia, o score é o que decide quem o time chama primeiro.

## Segurança e confiabilidade

- Senhas com scrypt, sessões em cookie HttpOnly/SameSite, bloqueio por excesso de tentativas, verificação de origem nas chamadas, cabeçalhos de segurança (CSP, HSTS).
- Webhook protegido por token secreto na URL (a Greenn não assina os eventos), comparado em tempo constante; a URL pode ser trocada a qualquer momento.
- Todo webhook é **gravado antes de ser processado**: nada se perde, e qualquer evento pode ser reprocessado pelo painel (ex.: chegou venda de um produto ainda não vinculado → vincula → reprocessa).
- Processamento idempotente: a Greenn pode reenviar o mesmo evento sem duplicar aluno, venda ou e-mail.
- Eventos de saída numa fila com retentativa: o CRM pode ficar fora do ar sem perder nada.
- Papéis de equipe (Proprietário, Administrador, Suporte, Leitura) e auditoria de cada ação.
- LGPD: exclusão definitiva do aluno pelo painel (só Proprietário); os números do aluno ficam só na sua VPS.

## Escala

| Volume | O que fazer |
|---|---|
| Até ~30–50 mil alunos ativos | Como está. SQLite em modo WAL atende milhares de gravações por segundo; o desafio grava poucas linhas por aluno por dia. Backup diário + cópia externa. |
| Picos de tráfego de lançamento | Os arquivos do app são estáticos e cacheados; o Nginx segura. Se quiser, coloque o domínio atrás da Cloudflare (gratuito). |
| Acima disso, ou várias instâncias | Trocar `src/db.js` por PostgreSQL (o resto do código não muda de forma relevante) e rodar 2+ containers atrás do Nginx. |
| Vídeos | Nunca na VPS. Panda Video (BR, proteção contra download, analytics) ou YouTube não listado no começo. |
| Brasileiros no exterior | O aluno escolhe a moeda no Dia 1 (real, euro, dólar americano/canadense/australiano, libra, franco, iene). Todos os cálculos, o painel e o CSV usam a moeda dele; o limite da Fase 3 tem um valor próprio para quem recebe em moeda forte. Os filtros “Mora: Brasil/Exterior” e “País” já separam os leads. |
| Versão em inglês/espanhol (US$ 20) | Criar um novo produto na Greenn com o ID vinculado a uma cópia do desafio. Falta traduzir os textos fixos do app (hoje em português), que é o próximo passo quando o produto em português estiver validado. |

## Já preparado para os próximos produtos

- **Multiproduto**: cada produto tem seus IDs da Greenn, regra de liberação, prazo de acesso e materiais. "Riqueza a Dois", o módulo com o pastor ou novos cursos entram como novos produtos.
- **Assinaturas**: eventos de contrato da Greenn (`contractUpdated`) já liberam e suspendem acesso, pronto para a futura comunidade mensal.
- **Order bump / bônus**: produto tipo "bônus" com materiais para download, liberado pelo próprio ID na Greenn.

## O que ainda falta

1. **Lembretes automáticos de data** (início do jejum/oração do Dia 3, dia do dízimo do Dia 5, dia da primícia do Dia 6). Os dados já são coletados; falta o disparo agendado por e-mail ou WhatsApp, e isso vale fazer junto com o fluxo de WhatsApp do CRM.
2. **Notificações push no celular** (Web Push). Funcionam no Android e no iPhone com o app instalado.
3. **Recuperação de inativos** (aluno parado há mais de 48h num dia liberado). O evento `day.completed` e o "visto por último" já dão a base.
4. **Textos do app em inglês e espanhol**, para a fase internacional.
