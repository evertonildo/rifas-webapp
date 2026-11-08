import { Injectable } from '@angular/core';
import {
  Rifa, Reserva, NumeroRifa, Participante, Premio, Comprovante, StatusNumero,
  novoId,
} from '../models/rifa.models';
import type { ReservaCriada } from '../services/rifas.service';

const CHAVE = 'rifas:demo:v1';

interface BancoDemo {
  rifas: Rifa[];
  numeros: Record<string, NumeroRifa[]>;
  reservas: Record<string, Reserva[]>;
  comprovantes: Record<string, Comprovante>;
}

type Ouvinte<T> = (valor: T) => void;

/**
 * Banco de dados em memória (persistido no localStorage) usado no MODO
 * DEMONSTRAÇÃO — quando o Firebase ainda não foi configurado.
 *
 * Serve para conhecer o app sem nenhuma configuração. Nada é enviado à rede.
 */
@Injectable({ providedIn: 'root' })
export class DemoStore {
  private banco: BancoDemo;
  private ouvintesRifas: Ouvinte<Rifa[]>[] = [];
  private ouvintesNumeros: Record<string, Ouvinte<NumeroRifa[]>[]> = {};
  private ouvintesReservas: Record<string, Ouvinte<Reserva[]>[]> = {};

  constructor() {
    this.banco = this.carregar();
  }

  private carregar(): BancoDemo {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (bruto) return JSON.parse(bruto) as BancoDemo;
    } catch { /* ignora */ }
    const inicial = this.semear();
    this.salvar(inicial);
    return inicial;
  }

  private salvar(banco: BancoDemo = this.banco): void {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(banco));
    } catch { /* ignora quota */ }
  }

  /** Dados de exemplo para o app não abrir vazio. */
  private semear(): BancoDemo {
    const id = 'demo-rifa-1';
    const total = 60;
    const rifa: Rifa = {
      id,
      titulo: 'Rifa do Notebook — Demonstração',
      descricao: 'Rifa de exemplo criada automaticamente para você conhecer o sistema.',
      totalNumeros: total,
      premios: [
        { id: novoId(), posicao: 1, descricao: 'Notebook 15" 16GB' },
        { id: novoId(), posicao: 2, descricao: 'Fone bluetooth' },
      ],
      valorNumero: 10,
      dataSorteio: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
      chave_pix: 'demo@rifas.app',
      instrucoes_pagamento: 'Pague por PIX e anexe o comprovante no link da sua reserva.',
      regulamento: 'Rifa de demonstração. Os dados são fictícios e ficam apenas neste navegador.',
      encerrada: false,
      sorteada: false,
      numero_sorteado: null,
      ganhador_nome: null,
      encerramento_automatico: true,
      sorteio_automatico: false,
      totalNumerosReservados: 0,
      totalNumerosPagos: 0,
      criado_por_nome: 'Demonstração',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const numeros: NumeroRifa[] = Array.from({ length: total }, (_, i) => ({
      numero: i + 1,
      status: 'livre' as StatusNumero,
    }));

    const reservas: Reserva[] = [];
    const participantes: Array<{ p: Participante; qtd: number; pago: boolean }> = [
      { p: { nome: 'Maria Souza', email: 'maria@exemplo.com', telefone: '11987654321', cidade: 'São Paulo/SP' }, qtd: 6, pago: true },
      { p: { nome: 'João Lima', email: 'joao@exemplo.com', telefone: '21991234567', cidade: 'Rio de Janeiro/RJ' }, qtd: 3, pago: true },
      { p: { nome: 'Ana Paula', email: 'ana@exemplo.com', telefone: '31988887777', cidade: 'Belo Horizonte/MG' }, qtd: 4, pago: false },
    ];

    let proximo = 1;
    for (const item of participantes) {
      const escolhidos = Array.from({ length: item.qtd }, () => proximo++);
      const reserva: Reserva = {
        id: novoId(),
        rifa_id: id,
        numeros: escolhidos,
        participante: item.p,
        status: item.pago ? 'pago' : 'reservado',
        valor_total: item.qtd * 10,
        pago_confirmado_em: item.pago ? new Date().toISOString() : undefined,
        pago_confirmado_por: item.pago ? 'Demonstração' : undefined,
        token: novoId(),
        created_at: new Date(Date.now() - Math.random() * 500000).toISOString(),
      };
      reservas.push(reserva);
      for (const n of escolhidos) {
        const alvo = numeros[n - 1];
        alvo.status = item.pago ? 'pago' : 'reservado';
        alvo.reserva_id = reserva.id;
        alvo.participante_nome = item.p.nome;
        alvo.participante_email = item.p.email;
        alvo.participante_telefone = item.p.telefone;
        alvo.participante_cidade = item.p.cidade;
      }
    }

    rifa.totalNumerosReservados = reservas.reduce((s, r) => s + r.numeros.length, 0);
    rifa.totalNumerosPagos = reservas.filter((r) => r.status === 'pago').reduce((s, r) => s + r.numeros.length, 0);

    return { rifas: [rifa], numeros: { [id]: numeros }, reservas: { [id]: reservas }, comprovantes: {} };
  }

  // ================= Notificações =================

  listarRifas(): Rifa[] {
    return [...this.banco.rifas].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }

  ouvirRifas(cb: Ouvinte<Rifa[]>): () => void {
    this.ouvintesRifas.push(cb);
    cb(this.listarRifas());
    return () => {
      this.ouvintesRifas = this.ouvintesRifas.filter((o) => o !== cb);
    };
  }

  numerosDe(rifaId: string): NumeroRifa[] {
    return [...(this.banco.numeros[rifaId] ?? [])].sort((a, b) => a.numero - b.numero);
  }

  ouvirNumeros(rifaId: string, cb: Ouvinte<NumeroRifa[]>): () => void {
    (this.ouvintesNumeros[rifaId] ??= []).push(cb);
    cb(this.numerosDe(rifaId));
    return () => {
      this.ouvintesNumeros[rifaId] = (this.ouvintesNumeros[rifaId] ?? []).filter((o) => o !== cb);
    };
  }

  reservasDe(rifaId: string): Reserva[] {
    return [...(this.banco.reservas[rifaId] ?? [])].sort(
      (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    );
  }

  ouvirReservas(rifaId: string, cb: Ouvinte<Reserva[]>): () => void {
    (this.ouvintesReservas[rifaId] ??= []).push(cb);
    cb(this.reservasDe(rifaId));
    return () => {
      this.ouvintesReservas[rifaId] = (this.ouvintesReservas[rifaId] ?? []).filter((o) => o !== cb);
    };
  }

  private notificar(rifaId?: string): void {
    this.salvar();
    const rifas = this.listarRifas();
    this.ouvintesRifas.forEach((cb) => cb(rifas));
    if (rifaId) {
      const ns = this.numerosDe(rifaId);
      (this.ouvintesNumeros[rifaId] ?? []).forEach((cb) => cb(ns));
      const rs = this.reservasDe(rifaId);
      (this.ouvintesReservas[rifaId] ?? []).forEach((cb) => cb(rs));
    }
  }

  // ================= Escritas =================

  obterRifa(id: string): Rifa | null {
    return this.banco.rifas.find((r) => r.id === id) ?? null;
  }

  criarRifa(dados: Partial<Rifa>, autor?: { id: string; nome: string; email?: string }): string {
    const id = novoId();
    const total = Math.max(1, Math.min(2000, Math.floor(dados.totalNumeros ?? 0)));
    const rifa: Rifa = {
      id,
      titulo: (dados.titulo ?? '').trim(),
      descricao: dados.descricao ?? '',
      totalNumeros: total,
      premios: (dados.premios ?? []) as Premio[],
      valorNumero: dados.valorNumero,
      dataSorteio: dados.dataSorteio,
      chave_pix: dados.chave_pix,
      instrucoes_pagamento: dados.instrucoes_pagamento,
      regulamento: dados.regulamento,
      encerrada: false,
      sorteada: false,
      numero_sorteado: null,
      ganhador_nome: null,
      encerramento_automatico: dados.encerramento_automatico !== false,
      sorteio_automatico: !!dados.sorteio_automatico,
      totalNumerosReservados: 0,
      totalNumerosPagos: 0,
      criado_por: autor?.id,
      criado_por_nome: autor?.nome,
      criado_por_email: autor?.email,
      banner: dados.banner,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Rifa;

    this.banco.rifas.push(rifa);
    this.banco.numeros[id] = Array.from({ length: total }, (_, i) => ({ numero: i + 1, status: 'livre' as StatusNumero }));
    this.banco.reservas[id] = [];
    this.notificar(id);
    return id;
  }

  atualizarRifa(id: string, dados: Partial<Rifa>): void {
    const rifa = this.banco.rifas.find((r) => r.id === id);
    if (!rifa) throw new Error('Rifa não encontrada.');

    const novoTotal = dados.totalNumeros ?? rifa.totalNumeros;
    if (novoTotal !== rifa.totalNumeros) {
      const ocupados = this.numerosDe(id).filter((n) => n.status !== 'livre').length;
      if (ocupados) throw new Error('Já existem números reservados — não é possível alterar a quantidade.');
      const total = Math.max(1, Math.min(2000, Math.floor(novoTotal)));
      this.banco.numeros[id] = Array.from({ length: total }, (_, i) => ({ numero: i + 1, status: 'livre' as StatusNumero }));
      rifa.totalNumeros = total;
    }

    Object.assign(rifa, {
      titulo: (dados.titulo ?? rifa.titulo).trim(),
      descricao: dados.descricao ?? rifa.descricao,
      premios: dados.premios ?? rifa.premios,
      valorNumero: dados.valorNumero ?? rifa.valorNumero,
      dataSorteio: dados.dataSorteio ?? rifa.dataSorteio,
      chave_pix: dados.chave_pix ?? rifa.chave_pix,
      instrucoes_pagamento: dados.instrucoes_pagamento ?? rifa.instrucoes_pagamento,
      regulamento: dados.regulamento ?? rifa.regulamento,
      encerramento_automatico: dados.encerramento_automatico ?? rifa.encerramento_automatico,
      sorteio_automatico: dados.sorteio_automatico ?? rifa.sorteio_automatico,
      updated_at: new Date().toISOString(),
    });
    this.notificar(id);
  }

  excluirRifa(id: string): void {
    this.banco.rifas = this.banco.rifas.filter((r) => r.id !== id);
    delete this.banco.numeros[id];
    delete this.banco.reservas[id];
    this.notificar();
  }

  reservar(rifaId: string, numeros: number[], participante: Participante): ReservaCriada {
    const rifa = this.obterRifa(rifaId);
    if (!rifa) throw new Error('Rifa não encontrada.');
    if (rifa.encerrada) throw new Error('Esta rifa já foi encerrada.');
    if (!numeros.length) throw new Error('Selecione pelo menos um número.');

    const lista = this.banco.numeros[rifaId] ?? [];
    for (const n of numeros) {
      const alvo = lista.find((x) => x.numero === n);
      if (!alvo) throw new Error(`O número ${n} não existe nesta rifa.`);
      if (alvo.status !== 'livre') throw new Error(`O número ${n} já está reservado. Escolha outro.`);
    }

    const id = novoId();
    const token = novoId() + novoId();
    const reserva: Reserva = {
      id,
      rifa_id: rifaId,
      numeros: [...numeros].sort((a, b) => a - b),
      participante: { ...participante },
      status: 'reservado',
      valor_total: rifa.valorNumero ? rifa.valorNumero * numeros.length : undefined,
      token,
      created_at: new Date().toISOString(),
    };
    (this.banco.reservas[rifaId] ??= []).push(reserva);

    for (const n of numeros) {
      const alvo = lista.find((x) => x.numero === n)!;
      alvo.status = 'reservado';
      alvo.reserva_id = id;
      alvo.participante_nome = participante.nome;
      alvo.participante_email = participante.email;
      alvo.participante_telefone = participante.telefone;
      alvo.participante_cidade = participante.cidade;
    }
    rifa.totalNumerosReservados = (rifa.totalNumerosReservados ?? 0) + numeros.length;
    this.notificar(rifaId);
    return { reserva, token };
  }

  obterReserva(rifaId: string, reservaId: string): Reserva | null {
    return (this.banco.reservas[rifaId] ?? []).find((r) => r.id === reservaId) ?? null;
  }

  enviarComprovante(
    rifaId: string,
    reservaId: string,
    token: string,
    arquivo: { nome: string; tipo: string; tamanho: number; base64: string },
  ): void {
    const reserva = this.obterReserva(rifaId, reservaId);
    if (!reserva) throw new Error('Reserva não encontrada.');
    if (reserva.token && reserva.token !== token) throw new Error('Código da reserva inválido.');

    this.banco.comprovantes[`${rifaId}/${reservaId}`] = {
      id: novoId(),
      nome: arquivo.nome,
      tipo: arquivo.tipo,
      tamanho: arquivo.tamanho,
      base64: arquivo.base64,
      enviado_em: new Date().toISOString(),
    };
    reserva.comprovante_nome = arquivo.nome;
    reserva.comprovante_tipo = arquivo.tipo;
    reserva.comprovante_tamanho = arquivo.tamanho;
    reserva.comprovante_enviado_em = new Date().toISOString();
    this.notificar(rifaId);
  }

  obterComprovante(rifaId: string, reservaId: string): Comprovante | null {
    return this.banco.comprovantes[`${rifaId}/${reservaId}`] ?? null;
  }

  confirmarPagamento(rifaId: string, reservaId: string, admin: { nome: string }): { encerrada: boolean; sorteada: boolean; numeroSorteado?: number } {
    const reserva = this.obterReserva(rifaId, reservaId);
    const rifa = this.obterRifa(rifaId);
    if (!reserva || !rifa) throw new Error('Reserva não encontrada.');
    if (reserva.status === 'pago') return { encerrada: rifa.encerrada, sorteada: rifa.sorteada };

    reserva.status = 'pago';
    reserva.pago_confirmado_em = new Date().toISOString();
    reserva.pago_confirmado_por = admin.nome;
    for (const n of reserva.numeros) {
      const alvo = this.banco.numeros[rifaId].find((x) => x.numero === n);
      if (alvo) alvo.status = 'pago';
    }
    rifa.totalNumerosPagos = (rifa.totalNumerosPagos ?? 0) + reserva.numeros.length;
    this.notificar(rifaId);

    const todosPagos = this.numerosDe(rifaId).every((n) => n.status === 'pago');
    if (todosPagos && !rifa.encerrada && rifa.encerramento_automatico) {
      rifa.encerrada = true;
      rifa.modo_encerramento = 'automatico';
      rifa.encerrada_em = new Date().toISOString();
      this.notificar(rifaId);
      if (rifa.sorteio_automatico) {
        const res = this.sortear(rifaId, { nome: 'Automático' });
        return { encerrada: true, sorteada: true, numeroSorteado: res.numero };
      }
      return { encerrada: true, sorteada: false };
    }
    return { encerrada: rifa.encerrada, sorteada: rifa.sorteada };
  }

  desfazerPagamento(rifaId: string, reservaId: string): void {
    const reserva = this.obterReserva(rifaId, reservaId);
    const rifa = this.obterRifa(rifaId);
    if (!reserva || !rifa || reserva.status !== 'pago') return;

    reserva.status = 'reservado';
    reserva.pago_confirmado_em = undefined;
    reserva.pago_confirmado_por = undefined;
    for (const n of reserva.numeros) {
      const alvo = this.banco.numeros[rifaId].find((x) => x.numero === n);
      if (alvo) alvo.status = 'reservado';
    }
    rifa.totalNumerosPagos = Math.max(0, (rifa.totalNumerosPagos ?? 0) - reserva.numeros.length);
    this.notificar(rifaId);
  }

  cancelarReserva(rifaId: string, reservaId: string): void {
    const reserva = this.obterReserva(rifaId, reservaId);
    const rifa = this.obterRifa(rifaId);
    if (!reserva) return;
    if (rifa?.sorteada) throw new Error('A rifa já foi sorteada — não é possível cancelar reservas.');

    for (const n of reserva.numeros) {
      const alvo = this.banco.numeros[rifaId].find((x) => x.numero === n);
      if (alvo) {
        alvo.status = 'livre';
        alvo.reserva_id = undefined;
        alvo.participante_nome = undefined;
        alvo.participante_email = undefined;
        alvo.participante_telefone = undefined;
        alvo.participante_cidade = undefined;
      }
    }
    if (rifa) {
      rifa.totalNumerosReservados = Math.max(0, (rifa.totalNumerosReservados ?? 0) - reserva.numeros.length);
      if (reserva.status === 'pago') {
        rifa.totalNumerosPagos = Math.max(0, (rifa.totalNumerosPagos ?? 0) - reserva.numeros.length);
      }
    }
    this.banco.reservas[rifaId] = this.banco.reservas[rifaId].filter((r) => r.id !== reservaId);
    delete this.banco.comprovantes[`${rifaId}/${reservaId}`];
    this.notificar(rifaId);
  }

  encerrarRifa(rifaId: string, modo: Rifa['modo_encerramento'], autor?: { nome: string }): void {
    const rifa = this.obterRifa(rifaId);
    if (!rifa) return;
    rifa.encerrada = true;
    rifa.modo_encerramento = modo;
    rifa.encerrada_em = new Date().toISOString();
    rifa.encerrada_por = autor?.nome;
    this.notificar(rifaId);
  }

  sortear(rifaId: string, autor?: { nome: string }): { numero: number; ganhador: string | null } {
    const rifa = this.obterRifa(rifaId);
    if (!rifa) throw new Error('Rifa não encontrada.');
    if (!rifa.encerrada) throw new Error('Encerre a rifa antes de sortear.');
    if (rifa.sorteada) throw new Error('Esta rifa já foi sorteada.');

    const pagos = this.numerosDe(rifaId).filter((n) => n.status === 'pago');
    if (!pagos.length) throw new Error('Nenhum número com pagamento confirmado — não há quem sorteie.');

    const escolhido = pagos[Math.floor(Math.random() * pagos.length)];
    rifa.sorteada = true;
    rifa.sorteada_em = new Date().toISOString();
    rifa.sorteada_por = autor?.nome;
    rifa.numero_sorteado = escolhido.numero;
    rifa.ganhador_nome = escolhido.participante_nome ?? null;
    this.notificar(rifaId);
    return { numero: escolhido.numero, ganhador: escolhido.participante_nome ?? null };
  }

  reabrirRifa(rifaId: string): void {
    const rifa = this.obterRifa(rifaId);
    if (!rifa) return;
    if (rifa.sorteada) throw new Error('Rifa já sorteada não pode ser reaberta.');
    rifa.encerrada = false;
    rifa.modo_encerramento = undefined;
    rifa.encerrada_em = undefined;
    this.notificar(rifaId);
  }

  /** Usado pelo botão "zerar demonstração". */
  reiniciar(): void {
    localStorage.removeItem(CHAVE);
    this.banco = this.semear();
    this.salvar();
    this.notificar(this.banco.rifas[0]?.id);
  }
}
