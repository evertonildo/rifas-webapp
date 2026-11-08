/**
 * Modelos de domínio do Sistema de Rifas (Ecosistema Audita).
 *
 * Regras de negócio:
 *  - Uma rifa tem título, quantidade de números e lista de prêmios.
 *  - O participante NÃO faz login: informa nome, email, telefone e cidade e
 *    reserva quantos números quiser.
 *  - Reservar NÃO é participar: a participação só existe após o admin
 *    confirmar o pagamento.
 *  - O comprovante é enviado em base64 (sem Firebase Storage) e vinculado a
 *    UMA reserva, que pode cobrir vários números.
 *  - O sorteio só ocorre com a rifa finalizada (manual ou automática quando
 *    todos os números pagos estiverem confirmados).
 */

export type Perfil = 'SYSOP' | 'ADMIN' | 'OPERATOR' | 'USER';

export const PERFIL_LABEL: Record<Perfil, string> = {
  SYSOP: 'SysOp',
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  USER: 'Usuário',
};

export const PERFIS_ADMIN: Perfil[] = ['SYSOP', 'ADMIN', 'OPERATOR'];

export function ehAdministrador(perfil: Perfil | undefined | null): boolean {
  return !!perfil && PERFIS_ADMIN.includes(perfil);
}

/** Só o SysOp cria/edita administradores e exclui qualquer rifa. */
export function ehSysop(perfil: Perfil | undefined | null): boolean {
  return perfil === 'SYSOP';
}

/** Blocos de 100 números (cota dos admins). */
export const BLOCO_NUMEROS = 100;

export function blocosParaNumeros(blocos: number): number {
  return Math.max(0, Math.floor(blocos)) * BLOCO_NUMEROS;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  perfil: Perfil;
  ativo?: boolean;
  /**
   * Quantidade de números (blocos de 100) que o administrador pode distribuir
   * entre as rifas que criar. Só o SYSOP define. `null`/ausente = ilimitado.
   */
  cotaNumeros?: number | null;
  /** Números já comprometidos em rifas ativas criadas por este admin. */
  cotaUsada?: number;
  /** Convite pendente: o acesso só é liberado depois que o admin aceita. */
  convite_pendente?: boolean;
  criado_por?: string;
  created_at?: string;
  updated_at?: string;
}

/** Etiquetas amigáveis dos perfis. */
export const PERFIL_DESCRICAO: Record<Perfil, string> = {
  SYSOP: 'Acesso total: cria admins, gerencia todas as rifas e pode excluir.',
  ADMIN: 'Cria e gerencia as próprias rifas, usando a cota de números liberada.',
  OPERATOR: 'Gerencia as rifas do próprio cadastro (mesmas regras do Admin).',
  USER: 'Sem acesso ao painel administrativo.',
};

/** Situação de cada número da rifa. */
export type StatusNumero = 'livre' | 'reservado' | 'pago';

export const STATUS_NUMERO_LABEL: Record<StatusNumero, string> = {
  livre: 'Livre',
  reservado: 'Reservado',
  pago: 'Pago',
};

/** Como a rifa foi encerrada. */
export type ModoEncerramento = 'manual' | 'automatico';

export interface Premio {
  id: string;
  posicao: number; // 1º, 2º, ...
  descricao: string;
}

export interface Rifa {
  id: string;
  titulo: string;
  descricao?: string;
  /** Quantidade total de números (1..N). */
  totalNumeros: number;
  /** Números reservados em bloco por um participante (padrão 1). */
  premios: Premio[];
  valorNumero?: number; // valor unitário em R$
  dataSorteio?: string; // ISO date (informativo)
  regulamento?: string;
  /** Banner da rifa: pode ser base64 (enviado) ou URL pública. */
  banner?: string;
  chave_pix?: string;
  instrucoes_pagamento?: string;
  /** Encerra sozinha quando todos os números estiverem pagos. */
  encerramento_automatico?: boolean;
  /** Sorteia sozinha logo após o encerramento automático. */
  sorteio_automatico?: boolean;
  totalNumerosReservados?: number;
  totalNumerosPagos?: number;
  encerrada: boolean;
  modo_encerramento?: ModoEncerramento;
  encerrada_em?: string;
  encerrada_por?: string;
  /** Número sorteado (após o sorteio). */
  numero_sorteado?: number | null;
  /** Reserva do número sorteado, se o número tiver sido pago. */
  ganhador_nome?: string | null;
  sorteada: boolean;
  sorteada_em?: string;
  sorteada_por?: string;
  criado_por?: string;
  criado_por_nome?: string;
  /** Email do admin dono (usado para escopo e regras do Firestore). */
  criado_por_email?: string;
  created_at?: string;
  updated_at?: string;
}

/** Dados do participante, reaproveitados em reservas seguintes (último participante). */
export interface Participante {
  nome: string;
  email: string;
  telefone: string;
  cidade: string;
}

/**
 * Reserva: um participante reservando 1+ números.
 * Cada reserva tem seu próprio comprovante e sua própria confirmação.
 */
export interface Reserva {
  id: string;
  rifa_id: string;
  numeros: number[];
  participante: Participante;
  /** Status agregado: reservado (aguardando) | pago (confirmado). */
  status: 'reservado' | 'pago';
  valor_total?: number;
  /** Comprovante em base64 (data URL) — guardado no doc do comprovante. */
  comprovante_nome?: string;
  comprovante_tipo?: string;
  comprovante_tamanho?: number;
  comprovante_enviado_em?: string;
  pago_confirmado_em?: string;
  pago_confirmado_por?: string;
  confirmacao_automatica?: boolean;
  observacao?: string;
  /** Código do link da reserva (o link é o acesso do participante). */
  token?: string;
  created_at?: string;
  updated_at?: string;
}

/** Documento da subcoleção reservas/{id}/comprovantes — o base64 vive aqui. */
export interface Comprovante {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  /** data URL: data:<mime>;base64,<conteudo> */
  base64: string;
  enviado_em?: string;
}

/** Número individual da rifa (documento em rifas/{id}/numeros/{numero}). */
export interface NumeroRifa {
  numero: number;
  status: StatusNumero;
  reserva_id?: string;
  participante_nome?: string;
  participante_email?: string;
  participante_telefone?: string;
  participante_cidade?: string;
  atualizado_em?: string;
}

export interface ConfigSorteio {
  /** Sorteia automaticamente quando todos os números estiverem pagos. */
  automatico: boolean;
}

export const SITUACAO_RIFA_LABEL = {
  aberta: 'Em andamento',
  encerrada: 'Encerrada',
  sorteada: 'Sorteada',
} as const;

export type SituacaoRifa = keyof typeof SITUACAO_RIFA_LABEL;

export function situacaoRifa(r: Pick<Rifa, 'encerrada' | 'sorteada'>): SituacaoRifa {
  if (r.sorteada) return 'sorteada';
  if (r.encerrada) return 'encerrada';
  return 'aberta';
}

export function novoId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function formatarMoeda(v: number | undefined | null): string {
  if (v === undefined || v === null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarData(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function apenasDigitos(v: string): string {
  return (v || '').replace(/\D+/g, '');
}

/** Formata telefone brasileiro para exibição: (11) 91234-5678. */
export function formatarTelefone(v: string | undefined | null): string {
  const d = apenasDigitos(v ?? '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? '';
}
