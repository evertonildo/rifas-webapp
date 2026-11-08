#!/usr/bin/env python3
"""
Pós-build: gera o HTML de compartilhamento (Open Graph) de cada rifa.

WhatsApp, Telegram e Facebook NÃO executam JavaScript: leem apenas as tags
<meta> do HTML servido. Como este app é uma SPA, o build produz um único
index.html. Este script cria, para cada rifa, uma página estática
`r/<id>/index.html` com as metas og:* corretas (título, descrição e banner da
rifa) e um redirecionamento imediato para a rifa no app.

De onde vêm os dados (nesta ordem):
  1. Firestore (REST público) — as rifas são legíveis sem autenticação pelas
     regras de segurança. Lê projectId/apiKey de src/environments/environment.ts.
  2. `rifas-og.json` na raiz do projeto (exportado pelo painel → Divulgação).

O link divulgado é  {BASE}/r/<id>  →  o WhatsApp mostra o banner da rifa.
Quem clica cai em    {BASE}/rifa/<id>  (a página real da rifa).

Uso:
    python3 scripts/gerar-og.py
    APP_BASE_URL=https://rifas.audita.app.br python3 scripts/gerar-og.py
"""
import base64
import json
import os
import re
import sys
import urllib.request
from html import escape

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(RAIZ, 'dist', 'rifas-webapp', 'browser')
DADOS = os.path.join(RAIZ, 'rifas-og.json')
ENV = os.path.join(RAIZ, 'src', 'environments', 'environment.ts')

BASE_URL = os.environ.get('APP_BASE_URL', 'https://rifas.audita.app.br').rstrip('/')

MODELO = """<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>{titulo}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- ===== Open Graph (WhatsApp / Facebook / Telegram / LinkedIn) ===== -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Rifas Audita">
  <meta property="og:title" content="{titulo}">
  <meta property="og:description" content="{descricao}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{imagem}">
  <meta property="og:image:secure_url" content="{imagem}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="{titulo}">
  <meta property="og:locale" content="pt_BR">

  <!-- ===== Twitter/X ===== -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{titulo}">
  <meta name="twitter:description" content="{descricao}">
  <meta name="twitter:image" content="{imagem}">

  <link rel="canonical" href="{url}">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#0f172a">

  <!-- Redireciona humanos para a rifa; os robôs de prévia leem só as metas acima -->
  <script>location.replace('/rifa/{id}');</script>
  <meta http-equiv="refresh" content="0; url=/rifa/{id}">
</head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#fff">
  <div style="max-width:560px;margin:12vh auto;padding:24px;text-align:center">
    <img src="{imagem}" alt="{titulo}" style="width:100%;border-radius:14px" />
    <h1 style="font-size:1.3rem;margin:18px 0 6px">{titulo}</h1>
    <p style="color:#c7d2fe;font-size:.92rem">{descricao}</p>
    <p><a href="/rifa/{id}" style="color:#38bdf8">Abrir a rifa →</a></p>
  </div>
</body>
</html>
"""


def ler_credenciais():
    """Lê projectId e apiKey de src/environments/environment.ts."""
    try:
        texto = open(ENV, encoding='utf-8').read()
    except OSError:
        return ('', '')
    pid = re.search(r"projectId:\s*'([^']+)'", texto)
    key = re.search(r"apiKey:\s*'([^']+)'", texto)
    project = pid.group(1) if pid else ''
    api_key = key.group(1) if key else ''
    if project.startswith('SEU-PROJETO') or api_key.startswith('SUBSTITUA'):
        return ('', '')
    return (project, api_key)


def valor_campo(campo):
    """Converte um campo do formato REST do Firestore para Python nativo."""
    if not isinstance(campo, dict):
        return None
    if 'stringValue' in campo:
        return campo['stringValue']
    if 'integerValue' in campo:
        return int(campo['integerValue'])
    if 'doubleValue' in campo:
        return float(campo['doubleValue'])
    if 'booleanValue' in campo:
        return campo['booleanValue']
    if 'timestampValue' in campo:
        return campo['timestampValue']
    if 'nullValue' in campo:
        return None
    if 'arrayValue' in campo:
        return [valor_campo(v) for v in campo['arrayValue'].get('values', [])]
    if 'mapValue' in campo:
        return {k: valor_campo(v) for k, v in campo['mapValue'].get('fields', {}).items()}
    return None


def ler_firestore():
    """Busca as rifas direto no Firestore (leitura pública pelas regras)."""
    project, api_key = ler_credenciais()
    if not project or not api_key:
        return []

    url = (
        'https://firestore.googleapis.com/v1/projects/' + project +
        '/databases/(default)/documents/rifas?pageSize=300&key=' + api_key
    )
    try:
        with urllib.request.urlopen(url, timeout=25) as resp:
            corpo = json.load(resp)
    except Exception as e:
        print('[og] Firestore indisponivel (%s) - usando rifas-og.json.' % type(e).__name__)
        return []

    rifas = []
    for doc in corpo.get('documents', []):
        campos = doc.get('fields', {})
        rid = doc.get('name', '').rsplit('/', 1)[-1]
        premios = valor_campo(campos.get('premios')) or []
        primeiro = ''
        if premios and isinstance(premios[0], dict):
            primeiro = premios[0].get('descricao', '') or ''
        rifas.append({
            'id': rid,
            'titulo': valor_campo(campos.get('titulo')) or 'Rifa',
            'descricao': valor_campo(campos.get('descricao')) or '',
            'imagem': valor_campo(campos.get('banner')) or '',
            'premio': primeiro,
        })
    return rifas


def ler_json_local():
    if not os.path.isfile(DADOS):
        return []
    try:
        with open(DADOS, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def guardar_banner(rid, data_url):
    """Grava o banner (data URL base64) em r/<id>/banner.jpg."""
    if not data_url or not data_url.startswith('data:image'):
        return ''
    try:
        _, conteudo = data_url.split(',', 1)
        binario = base64.b64decode(conteudo)
    except Exception:
        return ''

    destino = os.path.join(DIST, 'r', rid)
    os.makedirs(destino, exist_ok=True)
    with open(os.path.join(destino, 'banner.jpg'), 'wb') as f:
        f.write(binario)
    return '/r/%s/banner.jpg' % rid


def main():
    if not os.path.isdir(DIST):
        print('[og] build nao encontrado em %s. Rode npm run build antes.' % DIST, file=sys.stderr)
        return 1

    rifas = ler_firestore()
    origem = 'Firestore'
    if not rifas:
        rifas = ler_json_local()
        origem = 'rifas-og.json'
    if not rifas:
        print('[og] nenhuma rifa encontrada - as previas usarao o banner do app.')
        return 0

    geradas = 0
    for rifa in rifas:
        rid = str(rifa.get('id', '')).strip()
        if not rid or '/' in rid or '..' in rid:
            continue

        titulo = (rifa.get('titulo') or 'Rifa').strip()
        descricao = (rifa.get('descricao') or 'Reserve seu numero e participe!').strip()[:180]

        imagem = rifa.get('imagem') or ''
        if isinstance(imagem, str) and imagem.startswith('data:image'):
            imagem = guardar_banner(rid, imagem) or '/og-app.jpg'
        if not imagem:
            imagem = '/og-app.jpg'
        if imagem.startswith('/'):
            imagem = BASE_URL + imagem

        html = MODELO.format(
            titulo=escape(titulo, quote=True),
            descricao=escape(descricao, quote=True),
            url=BASE_URL + '/r/' + rid,
            imagem=escape(imagem, quote=True),
            id=rid,
        )

        destino = os.path.join(DIST, 'r', rid)
        os.makedirs(destino, exist_ok=True)
        with open(os.path.join(destino, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
        geradas += 1

    print('[og] %d pagina(s) de compartilhamento (%s) em %s/r/' % (geradas, origem, DIST))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
