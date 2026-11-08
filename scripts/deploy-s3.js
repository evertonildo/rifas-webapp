#!/usr/bin/env node
/**
 * Deploy do build para o bucket S3 + invalidação do CloudFront.
 *
 * Requer a AWS CLI configurada (aws configure) e estas variáveis:
 *   S3_BUCKET                    nome do bucket (obrigatório)
 *   CLOUDFRONT_DISTRIBUTION_ID   ID da distribuição (opcional — sem ele, não invalida)
 *   AWS_REGION                   região do bucket (padrão: us-east-1)
 *
 * Uso:
 *   npm run deploy:s3
 *   S3_BUCKET=meu-bucket CLOUDFRONT_DISTRIBUTION_ID=E123 npm run deploy:s3
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'rifas-webapp', 'browser');
const bucket = process.env.S3_BUCKET;
const distribuicao = process.env.CLOUDFRONT_DISTRIBUTION_ID;
const regiao = process.env.AWS_REGION || 'us-east-1';

function aws(args, opcoes = {}) {
  return execFileSync('aws', args, { stdio: 'inherit', env: process.env, ...opcoes });
}

function main() {
  if (!bucket) {
    console.error('✖ Defina S3_BUCKET (nome do bucket).');
    process.exit(1);
  }
  if (!fs.existsSync(DIST)) {
    console.error(`✖ Build não encontrado em ${DIST}. Rode "npm run build" antes.`);
    process.exit(1);
  }

  console.log(`→ Enviando assets para s3://${bucket} (região ${regiao})`);

  // 1) Estáticos com hash no nome: cache imutável de 1 ano.
  aws([
    's3', 'sync', DIST, `s3://${bucket}`,
    '--delete',
    '--region', regiao,
    '--exclude', 'index.html',
    '--exclude', 'sw.js',
    '--exclude', 'manifest.webmanifest',
    '--exclude', 'r/*',
    '--cache-control', 'public, max-age=31536000, immutable',
  ]);

  // 2) HTML / service worker / manifest: sempre revalidar.
  aws([
    's3', 'sync', DIST, `s3://${bucket}`,
    '--region', regiao,
    '--exclude', '*',
    '--include', 'index.html',
    '--include', 'sw.js',
    '--include', 'manifest.webmanifest',
    '--cache-control', 'no-cache, no-store, must-revalidate',
  ]);

  // 3) Páginas /r/<id> com as metas Open Graph de cada rifa.
  const pastaR = path.join(DIST, 'r');
  if (fs.existsSync(pastaR)) {
    aws([
      's3', 'sync', pastaR, `s3://${bucket}/r`,
      '--region', regiao,
      '--cache-control', 'public, max-age=300',
    ]);
  }

  // 4) Invalidação do CloudFront (HTML e service worker mudaram).
  if (distribuicao) {
    console.log(`→ Invalidando CloudFront ${distribuicao}`);
    aws([
      'cloudfront', 'create-invalidation',
      '--distribution-id', distribuicao,
      '--paths', '/*',
    ]);
  } else {
    console.log('ℹ CLOUDFRONT_DISTRIBUTION_ID não definido — invalidação ignorada.');
  }

  console.log('✔ Deploy concluído.');
}

main();
