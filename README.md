# 🎟️ Rifas Audita — Webapp de Rifas (Angular + Firebase)

Webapp para gerenciar rifas. O participante **não faz login**: escolhe os números, informa os
dados e envia o comprovante. O administrador confirma o pagamento, encerra e sorteia.

## ✅ Requisitos atendidos

| # | Requisito | Como foi implementado |
|---|-----------|----------------------|
| 1 | Um ou mais admins | Perfis `SYSOP` / `ADMIN` / `OPERATOR` + Firebase Authentication. |
| 2 | Participante sem login | Página pública `/rifa/:id`; a reserva gera um **link privado** com código (`?t=token`). |
| 3 | Pedir e-mail, telefone e cidade | Modal exige **nome, e-mail, telefone (com DDD) e cidade**, com validação. |
| 4 | Guardar dados do último participante | `localStorage` preenche automaticamente na próxima reserva. |
| 5 | Reserva ≠ participação | Números `reservado` (aguardando) e `pago` (confirmado). Só o admin confirma. |
| 6 | Botão de sortear | Sorteia **somente entre os números pagos**. Encerramento e sorteio automáticos configuráveis. |
| 7 | Título, nº de números e prêmios | Cadastro completo + valor por número, PIX, regulamento e data do sorteio. |
| 8 | Anexar comprovante | Vale para todos os números da reserva. |
| 9 | Só o admin confirma | Botão no painel; **regras do Firestore** bloqueiam o participante. |
| 10 | Sugerir instalação como webapp | PWA (manifest + service worker + banner de instalação, com instrução no iOS). |
| 11 | Dashboard | KPIs, ranking dos participantes mais ativos, desempenho por rifa e últimas reservas. |

## ✨ v2 — melhorias desta versão

| Melhoria | Onde |
|---|---|
| **Cadastro de administradores com cota** — nome, e-mail, telefone e blocos de 100 números. A cota é distribuída como quiser entre as rifas criadas (100 = 1 rifa de 100, ou 2 de 50, ou 4 de 25). | `Admin → Administradores` (só SysOp) |
| **Somente SysOp cria admins** | `sysopGuard` + regras `usuarios` |
| **Escopo por dono** — o Admin vê e gerencia apenas as rifas que criou; o SysOp gerencia todas e pode excluir | `admin-rifas`, `rifa-admin`, regras `rifas` |
| **Banner em cada rifa** na vitrine, com a descrição logo abaixo | `rifas-list.component.ts` |
| **Abas Em andamento / Encerradas** na vitrine | `rifas-list.component.ts` |
| **Banner do app** na prévia do link compartilhado | `index.html` (`og:image`) + `public/og-app.jpg` |
| **Link direto da rifa** com o banner dela na prévia do WhatsApp | `Admin → rifa → Sorteio → Compartilhar` (`/r/<id>`) |
| **Deploy S3 + CloudFront** com GitHub Action e invalidação | `.github/workflows/deploy-s3.yml`, `infra/s3-cloudfront.yml` |

### Como funciona a cota
1. O SysOp cria o admin escolhendo **N blocos de 100** → grava `cotaNumeros` em `usuarios/{uid}`.
2. Ao criar uma rifa, o app soma os `totalNumeros` das rifas daquele admin e bloqueia se passar
   do disponível (o formulário mostra "Sua cota: X de Y números disponíveis").
3. Excluir uma rifa devolve os números para a cota (o cálculo é sempre feito a partir das rifas existentes).
4. `cotaNumeros: null` = ilimitada (SysOp).

### Como funciona o banner no WhatsApp
O WhatsApp **não executa JavaScript** — ele lê apenas as tags `<meta>` do HTML. Como o app é uma
SPA, o deploy gera uma página estática por rifa:

```
/r/<id>/index.html   →  <meta og:title>, og:description, og:image = /r/<id>/banner.jpg
                        + redireciona para /rifa/<id>
```

O link divulgado é `.../r/<id>`. Quem clica cai na rifa; o WhatsApp mostra o banner dela.
O banner da rifa é gerado no navegador (canvas, 1200×630 com a grade de números) ou enviado pelo
admin no cadastro, e o `scripts/gerar-og.py` o grava como arquivo `banner.jpg` no build.
Sem banner próprio, o app usa `public/og-app.jpg`.

## 🚀 Como rodar

```bash
npm install
npm start          # http://localhost:4200
npm run build      # dist/rifas-webapp/browser
npm run build:og   # build + páginas de compartilhamento
```

### Modo demonstração (sem configurar nada)
Enquanto `src/environments/environment.ts` tiver credenciais de exemplo, o app roda com dados
fictícios no próprio navegador. Login com qualquer e-mail/senha entra como **SysOp**; para testar
o escopo de um Admin, use o e-mail de um admin criado em *Administradores* (ex.: `carla@rifas.app`).

## 🔥 Configurar o Firebase

1. Crie um projeto no Console do Firebase.
2. **Authentication** → ativar **E-mail/senha** → criar o usuário SysOp.
3. **Firestore Database** → criar banco (modo produção).
4. Copiar as credenciais para `src/environments/environment.ts`.
5. Publicar as regras: `firebase deploy --only firestore:rules` (ou `npm run deploy`).
6. Em `usuarios/{UID}` do SysOp, colocar `perfil: "SYSOP"`. Os admins criados pelo painel já
   nascem com o documento e a cota corretos.

## ☁️ Deploy em S3 + CloudFront

### 1) Infraestrutura (uma vez)
```bash
aws cloudformation deploy \
  --template-file infra/s3-cloudfront.yml \
  --stack-name rifas-audita \
  --parameter-overrides Dominio=rifas.audita.app.br \
                       CertificadoArn=arn:aws:acm:us-east-1:...:certificate/... \
  --capabilities CAPABILITY_IAM
```
Cria bucket privado, CloudFront com OAC, função de borda que resolve SPA + `/r/<id>`, e devolve
nos *Outputs* o `BucketName`, `DistributionId` e a URL pública.

### 2) Deploy do conteúdo
```bash
S3_BUCKET=seu-bucket CLOUDFRONT_DISTRIBUTION_ID=E123 npm run deploy:s3
```
Cache: assets com hash por 1 ano (`immutable`); `index.html`, `sw.js` e `manifest` sem cache;
páginas `/r/` com 300 s. Ao final, invalida `/*` no CloudFront.

### 3) GitHub Action
`.github/workflows/deploy-s3.yml` roda a cada push em `main`. Segredos necessários:
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`,
`CLOUDFRONT_DISTRIBUTION_ID`, `APP_BASE_URL` e as `FIREBASE_*`
(`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`,
`FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`).

> A Action grava `environment.prod.ts` com os segredos, faz o build, gera as páginas `/r/`,
> sincroniza o S3 em duas passadas (cache longo / sem cache) e invalida o CloudFront.

## 🗂️ Estrutura

```
src/app/
  core/
    models/rifa.models.ts             # tipos, perfis e cota (blocos de 100)
    services/firebase.service.ts      # conexão única (Firestore/Auth)
    services/auth.service.ts          # login, adminGuard, sysopGuard
    services/admins.service.ts        # criar/editar admins + cota
    services/rifas.service.ts         # reserva, pagamento, sorteio, escopo por dono
    services/banner.service.ts        # gera o banner 1200×630 no canvas
    services/comprovante.service.ts   # comprime a imagem e converte em base64
    services/instalacao.service.ts    # PWA
    services/modo-app.service.ts      # detecta modo demonstração
    demo/demo-store.ts                # banco local do modo demonstração
  features/
    publicas/rifas-list.component.ts  # vitrine com banners + abas
    publicas/rifa-detalhe.component.ts
    publicas/reserva.component.ts
    admin/admin-rifas.component.ts    # painel (escopo por dono; excluir = SysOp)
    admin/admins.component.ts         # cadastro de admins (SysOp)
    admin/rifa-form.component.ts      # cadastro/edição + banner + cota
    admin/rifa-admin.component.ts     # reservas, pagamentos, sorteio, compartilhar
    admin/previas.component.ts        # links de divulgação (/r/<id>)
    admin/dashboard.component.ts
  shared/banner-instalar.component.ts, aviso-demo.component.ts
public/manifest.webmanifest, sw.js, og-app.jpg, icons/
scripts/gerar-og.py, deploy-s3.js, serve.py
infra/s3-cloudfront.yml
.github/workflows/deploy-s3.yml
firestore.rules
```

## 📦 Modelo de dados (Firestore)

```
usuarios/{uid}
  nome, email, telefone, perfil (SYSOP|ADMIN|OPERATOR|USER),
  cotaNumeros (null = ilimitada), ativo, criado_por

rifas/{rifaId}
  titulo, descricao, totalNumeros, premios[], valorNumero, dataSorteio,
  chave_pix, instrucoes_pagamento, regulamento, banner,
  criado_por, criado_por_nome, criado_por_email,   ← escopo por dono
  encerrada, sorteada, numero_sorteado, ganhador_nome,
  encerramento_automatico, sorteio_automatico,
  totalNumerosReservados, totalNumerosPagos

rifas/{rifaId}/numeros/{numero}
  numero, status (livre|reservado|pago), reserva_id, participante_*

rifas/{rifaId}/reservas/{reservaId}
  numeros[], participante{nome,email,telefone,cidade}, status,
  valor_total, token, comprovante_*, pago_confirmado_*

rifas/{rifaId}/reservas/{reservaId}/comprovantes/{id}
  nome, tipo, tamanho, base64, enviado_em
```

## 🔐 Regras de segurança (resumo)

- Leitura pública de rifas, números e reservas (participante sem login).
- Qualquer pessoa cria reserva e reserva número livre de rifa aberta.
- Participante **não** altera status da reserva nem marca número como pago.
- **Criar rifa:** qualquer admin, gravando o próprio e-mail em `criado_por_email`.
- **Editar rifa:** SysOp sempre; o dono só enquanto a rifa estiver aberta.
- **Excluir rifa:** somente SysOp.
- **Usuários:** só SysOp cria/edita administradores e cotas; o próprio usuário altera apenas o nome.

## ⚠️ Observações

- Limite de ~1 MB por documento no Firestore: comprovantes são comprimidos para ~700 KB.
- O banner da rifa vai em base64 no documento da rifa (JPEG ~1200×630, poucas dezenas de KB,
  bem abaixo do limite). O build o converte em arquivo `banner.jpg` para a prévia do WhatsApp.
- O sorteio usa `Math.random()` no navegador do admin — para auditoria oficial, sorteie em
  público (live) ou registre o resultado; o app grava número, ganhador, data e quem sorteou.
- Ao excluir a conta de um admin, a conta de Authentication precisa ser removida no Console
  (o SDK do cliente não apaga usuários de terceiros).
