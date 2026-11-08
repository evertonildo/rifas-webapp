import { Injectable, inject } from '@angular/core';
import {
  collection, collectionGroup, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, onSnapshot, query, where, writeBatch, runTransaction,
  serverTimestamp, orderBy, documentId,
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { ModoAppService } from './modo-app.service';
import { DemoStore } from '../demo/demo-store';
import {
  Rifa, Reserva, NumeroRifa, Participante, Premio, Comprovante,
  StatusNumero, novoId,
} from '../models/rifa.models';

/** Resultado de uma reserva recém-criada (o token dá acesso ao comprovante). */
export interface ReservaCriada {
  reserva: Reserva;
  token: string;
}

/**
 * Regras de negócio das rifas.
 *
 * Estrutura no Firestore:
 *   rifas/{rifaId}
 *   rifas/{rifaId}/numeros/{numero}        → status de cada número
 *   rifas/{rifaId}/reservas/{reservaId}    → dados do participante + status
 *   rifas/{rifaId}/reservas/{reservaId}/comprovantes/{compId} → base64
 */
@Injectable({ providedIn: 'root' })
export class RifasService {
  private readonly fb = inject(FirebaseService);
  private readonly demo = inject(DemoStore);
  private readonly modo = inject(ModoAppService);

  // ======================= RIFAS =======================

  private rifaDe(id: string, dados: Record<string, unknown>): Rifa {
    const d = dados as Record<string, unknown>;
    return {
      id,
      titulo: (d['titulo'] as string) ?? 'Rifa',
      descricao: d['descricao'] as string | undefined,
      totalNumeros: Number(d['totalNumeros'] ?? 0),
      premios: (d['premios'] as Premio[]) ?? [],
      valorNumero: d['valorNumero'] as number | undefined,
      dataSorteio: d['dataSorteio'] as string | undefined,
      regulamento: d['regulamento'] as string | undefined,
      chave_pix: d['chave_pix'] as string | undefined,
      instrucoes_pagamento: d['instrucoes_pagamento'] as string | undefined,
      banner: d['banner'] as string | undefined,
      criado_por_email: d['criado_por_email'] as string | undefined,
      encerrada: !!d['encerrada'],
      modo_encerramento: d['modo_encerramento'] as Rifa['modo_encerramento'],
      encerrada_em: FirebaseService.paraIso(d['encerrada_em']),
      numero_sorteado: (d['numero_sorteado'] as number | null) ?? null,
      ganhador_nome: (d['ganhador_nome'] as string | null) ?? null,
      sorteada: !!d['sorteada'],
      sorteada_em: FirebaseService.paraIso(d['sorteada_em']),
      criado_por: d['criado_por'] as string | undefined,
      criado_por_nome: d['criado_por_nome'] as string | undefined,
      created_at: FirebaseService.paraIso(d['created_at']),
      updated_at: FirebaseService.paraIso(d['updated_at']),
      encerramento_automatico: d['encerramento_automatico'] !== false,
      sorteio_automatico: !!d['sorteio_automatico'],
      totalNumerosReservados: Number(d['totalNumerosReservados'] ?? 0),
      totalNumerosPagos: Number(d['totalNumerosPagos'] ?? 0),
    } as Rifa;
  }

  /** Observa a lista de rifas em tempo real (ordem de criação, mais novas primeiro). */
  observarRifas(cb: (rifas: Rifa[]) => void): () => void {
    if (this.modo.demo) return this.demo.ouvirRifas(cb);

    const q = query(collection(this.fb.db, 'rifas'), orderBy('created_at', 'desc'));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => this.rifaDe(d.id, d.data()))),
      (err) => {
        console.error('observarRifas', err);
        cb([]);
      },
    );
  }

  /** Leitura única da lista de rifas (para validações e dashboards). */
  async listarRifas(): Promise<Rifa[]> {
    if (this.modo.demo) return this.demo.listarRifas();
    const snap = await getDocs(query(collection(this.fb.db, 'rifas'), orderBy('created_at', 'desc')));
    return snap.docs.map((d) => this.rifaDe(d.id, d.data()));
  }

  /** Rifas criadas por um administrador (escopo dele). */
  async listarRifasDoAdmin(usuario: { id: string; email: string }): Promise<Rifa[]> {
    const todas = await this.listarRifas();
    return todas.filter((r) => this.ehDonoDaRifa(r, usuario));
  }

  /** Compara o dono da rifa com o usuário (email é o vínculo estável). */
  ehDonoDaRifa(rifa: Pick<Rifa, 'criado_por' | 'criado_por_email'>, usuario: { id: string; email: string }): boolean {
    const email = (usuario.email ?? '').trim().toLowerCase();
    const donoEmail = (rifa.criado_por_email ?? '').trim().toLowerCase();
    if (donoEmail && email) return donoEmail === email;
    return !!rifa.criado_por && rifa.criado_por === usuario.id;
  }

  /**
   * Verifica se o administrador ainda tem cota para abrir uma rifa com
   * `totalNumeros` números. Cota `null` = ilimitada (SysOp).
   * Lança erro explicativo quando estoura.
   */
  async validarCota(
    usuario: { id: string; email: string; cotaNumeros?: number | null },
    totalNumeros: number,
    rifaEditandoId?: string,
  ): Promise<void> {
    const cota = usuario.cotaNumeros;
    if (cota === null || cota === undefined) return;

    const minhas = await this.listarRifasDoAdmin(usuario);
    const usado = minhas
      .filter((r) => r.id !== rifaEditandoId)
      .reduce((s, r) => s + (r.totalNumeros || 0), 0);
    const disponivel = Math.max(0, cota - usado);

    if (totalNumeros > disponivel) {
      throw new Error(
        `Sua cota permite ${disponivel} número(s) e esta rifa precisa de ${totalNumeros}. ` +
          `Reduza a quantidade ou peça mais blocos ao SysOp.`,
      );
    }
  }

  async obterRifa(id: string): Promise<Rifa | null> {
    if (this.modo.demo) return this.demo.obterRifa(id);

    const snap = await getDoc(doc(this.fb.db, 'rifas', id));
    return snap.exists() ? this.rifaDe(snap.id, snap.data()) : null;
  }

  async criarRifa(dados: Partial<Rifa>, autor?: { id: string; nome: string; email?: string }): Promise<string> {
    if (this.modo.demo) return this.demo.criarRifa(dados, autor);

    const ref = doc(collection(this.fb.db, 'rifas'));
    const total = Math.max(1, Math.min(2000, Math.floor(dados.totalNumeros ?? 0)));

    await setDoc(ref, {
      titulo: (dados.titulo ?? '').trim(),
      descricao: (dados.descricao ?? '').trim(),
      totalNumeros: total,
      premios: (dados.premios ?? []).filter((p) => p.descricao.trim()),
      valorNumero: dados.valorNumero ?? null,
      dataSorteio: dados.dataSorteio ?? null,
      chave_pix: dados.chave_pix ?? '',
      instrucoes_pagamento: dados.instrucoes_pagamento ?? '',
      regulamento: dados.regulamento ?? '',
      encerrada: false,
      sorteada: false,
      numero_sorteado: null,
      ganhador_nome: null,
      encerramento_automatico: dados.encerramento_automatico !== false,
      sorteio_automatico: !!dados.sorteio_automatico,
      totalNumerosReservados: 0,
      totalNumerosPagos: 0,
      criado_por: autor?.id ?? null,
      criado_por_nome: autor?.nome ?? null,
      criado_por_email: autor?.email ?? null,
      banner: dados.banner ?? '',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    await this.criarNumeros(ref.id, total);
    return ref.id;
  }

  /** Cria os documentos de todos os números da rifa, em blocos (limite do batch = 500). */
  private async criarNumeros(rifaId: string, total: number): Promise<void> {
    const base = collection(this.fb.db, 'rifas', rifaId, 'numeros');
    for (let i = 1; i <= total; i += 400) {
      const batch = writeBatch(this.fb.db);
      for (let n = i; n <= Math.min(total, i + 399); n++) {
        batch.set(doc(base, String(n)), {
          numero: n,
          status: 'livre' as StatusNumero,
          reserva_id: null,
          atualizado_em: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }

  async atualizarRifa(id: string, dados: Partial<Rifa>): Promise<void> {
    if (this.modo.demo) return this.demo.atualizarRifa(id, dados);

    const atual = await this.obterRifa(id);
    if (!atual) throw new Error('Rifa não encontrada.');

    const payload: Record<string, unknown> = {
      titulo: (dados.titulo ?? atual.titulo).trim(),
      descricao: dados.descricao ?? atual.descricao ?? '',
      premios: (dados.premios ?? atual.premios).filter((p) => p.descricao.trim()),
      valorNumero: dados.valorNumero ?? atual.valorNumero ?? null,
      dataSorteio: dados.dataSorteio ?? atual.dataSorteio ?? null,
      banner: dados.banner ?? atual.banner ?? '',
      chave_pix: dados.chave_pix ?? atual.chave_pix ?? '',
      instrucoes_pagamento: dados.instrucoes_pagamento ?? atual.instrucoes_pagamento ?? '',
      regulamento: dados.regulamento ?? atual.regulamento ?? '',
      encerramento_automatico: dados.encerramento_automatico ?? atual.encerramento_automatico ?? true,
      sorteio_automatico: dados.sorteio_automatico ?? atual.sorteio_automatico ?? false,
      updated_at: serverTimestamp(),
    };

    // Só permite mudar a quantidade de números enquanto nenhum foi reservado.
    const novoTotal = dados.totalNumeros ?? atual.totalNumeros;
    if (novoTotal !== atual.totalNumeros) {
      const numeros = await this.listarNumeros(id);
      const ocupados = numeros.filter((n) => n.status !== 'livre').length;
      if (ocupados > 0) throw new Error('Já existem números reservados — não é possível alterar a quantidade.');
      const total = Math.max(1, Math.min(2000, Math.floor(novoTotal)));
      payload['totalNumeros'] = total;
      await this.criarNumeros(id, total);
    }

    await updateDoc(doc(this.fb.db, 'rifas', id), payload);
  }

  async excluirRifa(id: string): Promise<void> {
    if (this.modo.demo) return this.demo.excluirRifa(id);

    // Apaga as subcoleções em blocos e depois o documento da rifa.
    const numeros = await getDocs(collection(this.fb.db, 'rifas', id, 'numeros'));
    const reservas = await getDocs(collection(this.fb.db, 'rifas', id, 'reservas'));
    for (const r of reservas.docs) {
      const comps = await getDocs(collection(r.ref, 'comprovantes'));
      for (const c of comps.docs) await deleteDoc(c.ref);
      await deleteDoc(r.ref);
    }
    const todos = [...numeros.docs];
    for (let i = 0; i < todos.length; i += 400) {
      const batch = writeBatch(this.fb.db);
      todos.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(doc(this.fb.db, 'rifas', id));
  }

  // ======================= NÚMEROS =======================

  private numeroDe(dados: Record<string, unknown>): NumeroRifa {
    return {
      numero: Number(dados['numero'] ?? 0),
      status: (dados['status'] as StatusNumero) ?? 'livre',
      reserva_id: dados['reserva_id'] as string | undefined,
      participante_nome: dados['participante_nome'] as string | undefined,
      participante_email: dados['participante_email'] as string | undefined,
      participante_telefone: dados['participante_telefone'] as string | undefined,
      participante_cidade: dados['participante_cidade'] as string | undefined,
      atualizado_em: FirebaseService.paraIso(dados['atualizado_em']),
    };
  }

  async listarNumeros(rifaId: string): Promise<NumeroRifa[]> {
    if (this.modo.demo) return this.demo.numerosDe(rifaId);

    const snap = await getDocs(collection(this.fb.db, 'rifas', rifaId, 'numeros'));
    return snap.docs
      .map((d) => this.numeroDe(d.data()))
      .sort((a, b) => a.numero - b.numero);
  }

  /** Tempo real dos números (grade da rifa). */
  observarNumeros(rifaId: string, cb: (numeros: NumeroRifa[]) => void): () => void {
    if (this.modo.demo) return this.demo.ouvirNumeros(rifaId, cb);

    return onSnapshot(
      collection(this.fb.db, 'rifas', rifaId, 'numeros'),
      (snap) => {
        const lista = snap.docs.map((d) => this.numeroDe(d.data())).sort((a, b) => a.numero - b.numero);
        cb(lista);
      },
      (err) => {
        console.error('observarNumeros', err);
        cb([]);
      },
    );
  }

  // ======================= RESERVAS =======================

  private reservaDe(id: string, dados: Record<string, unknown>): Reserva {
    return {
      id,
      rifa_id: (dados['rifa_id'] as string) ?? '',
      numeros: (dados['numeros'] as number[]) ?? [],
      participante: (dados['participante'] as Participante) ?? { nome: '', email: '', telefone: '', cidade: '' },
      status: (dados['status'] as Reserva['status']) ?? 'reservado',
      valor_total: dados['valor_total'] as number | undefined,
      comprovante_nome: dados['comprovante_nome'] as string | undefined,
      comprovante_tipo: dados['comprovante_tipo'] as string | undefined,
      comprovante_tamanho: dados['comprovante_tamanho'] as number | undefined,
      comprovante_enviado_em: FirebaseService.paraIso(dados['comprovante_enviado_em']),
      pago_confirmado_em: FirebaseService.paraIso(dados['pago_confirmado_em']),
      pago_confirmado_por: dados['pago_confirmado_por'] as string | undefined,
      confirmacao_automatica: !!dados['confirmacao_automatica'],
      observacao: dados['observacao'] as string | undefined,
      created_at: FirebaseService.paraIso(dados['created_at']),
      updated_at: FirebaseService.paraIso(dados['updated_at']),
      token: dados['token'] as string | undefined,
    } as Reserva;
  }

  async listarReservas(rifaId: string): Promise<Reserva[]> {
    if (this.modo.demo) return this.demo.reservasDe(rifaId);

    const snap = await getDocs(collection(this.fb.db, 'rifas', rifaId, 'reservas'));
    return snap.docs
      .map((d) => this.reservaDe(d.id, d.data()))
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }

  /** Todas as reservas de todas as rifas (dashboard consolidado). */
  async listarTodasReservas(): Promise<Reserva[]> {
    if (this.modo.demo) {
      return this.demo.listarRifas().flatMap((r) => this.demo.reservasDe(r.id));
    }

    const snap = await getDocs(collectionGroup(this.fb.db, 'reservas'));
    return snap.docs.map((d) => this.reservaDe(d.id, d.data()));
  }

  observarReservas(rifaId: string, cb: (reservas: Reserva[]) => void): () => void {
    if (this.modo.demo) return this.demo.ouvirReservas(rifaId, cb);

    return onSnapshot(
      collection(this.fb.db, 'rifas', rifaId, 'reservas'),
      (snap) => {
        const lista = snap.docs
          .map((d) => this.reservaDe(d.id, d.data()))
          .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
        cb(lista);
      },
      (err) => {
        console.error('observarReservas', err);
        cb([]);
      },
    );
  }

  /**
   * Reserva números para um participante.
   *
   * Usa transação: relê cada número, garante que está livre e só então grava.
   * Isso evita que duas pessoas reservem o mesmo número simultaneamente.
   */
  async reservar(rifaId: string, numeros: number[], participante: Participante): Promise<ReservaCriada> {
    if (this.modo.demo) return this.demo.reservar(rifaId, numeros, participante);

    const rifaRef = doc(this.fb.db, 'rifas', rifaId);
    const reservaRef = doc(collection(this.fb.db, 'rifas', rifaId, 'reservas'));
    const token = novoId() + novoId();

    const rifa = await this.obterRifa(rifaId);
    if (!rifa) throw new Error('Rifa não encontrada.');
    if (rifa.encerrada) throw new Error('Esta rifa já foi encerrada.');
    if (!numeros.length) throw new Error('Selecione pelo menos um número.');

    const valor_total = rifa.valorNumero ? rifa.valorNumero * numeros.length : undefined;

    await runTransaction(this.fb.db, async (tx) => {
      const snaps = await Promise.all(
        numeros.map((n) => tx.get(doc(this.fb.db, 'rifas', rifaId, 'numeros', String(n)))),
      );

      snaps.forEach((snap, i) => {
        if (!snap.exists()) throw new Error(`O número ${numeros[i]} não existe nesta rifa.`);
        const st = snap.data()['status'] as StatusNumero;
        if (st !== 'livre') throw new Error(`O número ${numeros[i]} acabou de ser reservado. Escolha outro.`);
      });

      const dadosReserva = {
        rifa_id: rifaId,
        numeros: [...numeros].sort((a, b) => a - b),
        participante: {
          nome: participante.nome.trim(),
          email: participante.email.trim().toLowerCase(),
          telefone: participante.telefone.trim(),
          cidade: participante.cidade.trim(),
        },
        status: 'reservado',
        valor_total: valor_total ?? null,
        token,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      tx.set(reservaRef, dadosReserva);

      for (const n of numeros) {
        tx.set(
          doc(this.fb.db, 'rifas', rifaId, 'numeros', String(n)),
          {
            numero: n,
            status: 'reservado' as StatusNumero,
            reserva_id: reservaRef.id,
            participante_nome: dadosReserva.participante.nome,
            participante_email: dadosReserva.participante.email,
            participante_telefone: dadosReserva.participante.telefone,
            participante_cidade: dadosReserva.participante.cidade,
            atualizado_em: serverTimestamp(),
          },
          { merge: true },
        );
      }

      tx.update(rifaRef, {
        totalNumerosReservados: (rifa.totalNumerosReservados ?? 0) + numeros.length,
        updated_at: serverTimestamp(),
      });
    });

    const reserva: Reserva = {
      id: reservaRef.id,
      rifa_id: rifaId,
      numeros: [...numeros].sort((a, b) => a - b),
      participante,
      status: 'reservado',
      valor_total,
      created_at: new Date().toISOString(),
      token,
    };
    return { reserva, token };
  }

  /** Recupera uma reserva pelo id (usada no link do comprovante). */
  async obterReserva(rifaId: string, reservaId: string): Promise<Reserva | null> {
    if (this.modo.demo) return this.demo.obterReserva(rifaId, reservaId);

    const snap = await getDoc(doc(this.fb.db, 'rifas', rifaId, 'reservas', reservaId));
    return snap.exists() ? this.reservaDe(snap.id, snap.data()) : null;
  }

  /**
   * Salva o comprovante em base64 num documento próprio da reserva
   * (subcoleção `comprovantes`), mantendo a reserva leve.
   */
  async enviarComprovante(
    rifaId: string,
    reservaId: string,
    token: string,
    arquivo: { nome: string; tipo: string; tamanho: number; base64: string },
  ): Promise<void> {
    if (this.modo.demo) return this.demo.enviarComprovante(rifaId, reservaId, token, arquivo);

    const reserva = await this.obterReserva(rifaId, reservaId);
    if (!reserva) throw new Error('Reserva não encontrada.');
    if (reserva.token && reserva.token !== token) throw new Error('Código da reserva inválido.');

    const compRef = doc(collection(this.fb.db, 'rifas', rifaId, 'reservas', reservaId, 'comprovantes'));
    const comp: Comprovante & { token: string } = {
      id: compRef.id,
      nome: arquivo.nome,
      tipo: arquivo.tipo,
      tamanho: arquivo.tamanho,
      base64: arquivo.base64,
      enviado_em: new Date().toISOString(),
      token,
    };
    await setDoc(compRef, comp);

    await updateDoc(doc(this.fb.db, 'rifas', rifaId, 'reservas', reservaId), {
      comprovante_nome: arquivo.nome,
      comprovante_tipo: arquivo.tipo,
      comprovante_tamanho: arquivo.tamanho,
      comprovante_enviado_em: serverTimestamp(),
      comprovante_id: compRef.id,
      updated_at: serverTimestamp(),
    });
  }

  /** Lê o comprovante (base64) de uma reserva. */
  async obterComprovante(rifaId: string, reservaId: string): Promise<Comprovante | null> {
    if (this.modo.demo) return this.demo.obterComprovante(rifaId, reservaId);

    const snap = await getDocs(collection(this.fb.db, 'rifas', rifaId, 'reservas', reservaId, 'comprovantes'));
    if (snap.empty) return null;
    const d = snap.docs[snap.docs.length - 1];
    const dados = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      nome: (dados['nome'] as string) ?? 'comprovante',
      tipo: (dados['tipo'] as string) ?? 'image/jpeg',
      tamanho: Number(dados['tamanho'] ?? 0),
      base64: (dados['base64'] as string) ?? '',
      enviado_em: FirebaseService.paraIso(dados['enviado_em']),
    };
  }

  // ======================= ADMIN: PAGAMENTO =======================

  /**
   * Confirma o pagamento de uma reserva (somente admin, garantido pelas regras).
   * Também marca os números como pagos e, se todos estiverem pagos e a rifa
   * permitir encerramento automático, encerra (e sorteia, se configurado).
   */
  async confirmarPagamento(
    rifaId: string,
    reservaId: string,
    admin: { id: string; nome: string },
  ): Promise<{ encerrada: boolean; sorteada: boolean; numeroSorteado?: number }> {
    if (this.modo.demo) return this.demo.confirmarPagamento(rifaId, reservaId, admin);

    const reserva = await this.obterReserva(rifaId, reservaId);
    if (!reserva) throw new Error('Reserva não encontrada.');
    if (reserva.status === 'pago') return { encerrada: false, sorteada: false };

    const batch = writeBatch(this.fb.db);
    batch.update(doc(this.fb.db, 'rifas', rifaId, 'reservas', reservaId), {
      status: 'pago',
      pago_confirmado_em: serverTimestamp(),
      pago_confirmado_por: admin.nome,
      updated_at: serverTimestamp(),
    });
    for (const n of reserva.numeros) {
      batch.update(doc(this.fb.db, 'rifas', rifaId, 'numeros', String(n)), {
        status: 'pago' as StatusNumero,
        atualizado_em: serverTimestamp(),
      });
    }
    const rifa = await this.obterRifa(rifaId);
    if (rifa) {
      batch.update(doc(this.fb.db, 'rifas', rifaId), {
        totalNumerosPagos: (rifa.totalNumerosPagos ?? 0) + reserva.numeros.length,
        updated_at: serverTimestamp(),
      });
    }
    await batch.commit();

    const atualizada = await this.obterRifa(rifaId);
    if (!atualizada) return { encerrada: false, sorteada: false };

    const numeros = await this.listarNumeros(rifaId);
    const todosPagos = numeros.length > 0 && numeros.every((n) => n.status === 'pago');

    if (!todosPagos || atualizada.encerrada) {
      return { encerrada: atualizada.encerrada, sorteada: atualizada.sorteada };
    }

    if (atualizada.encerramento_automatico) {
      await this.encerrarRifa(rifaId, 'automatico', admin);
      if (atualizada.sorteio_automatico) {
        const sorteio = await this.sortear(rifaId, admin);
        return { encerrada: true, sorteada: true, numeroSorteado: sorteio.numero };
      }
      return { encerrada: true, sorteada: false };
    }

    return { encerrada: false, sorteada: false };
  }

  /** Desfaz a confirmação de pagamento (volta a reservado). */
  async desfazerPagamento(rifaId: string, reservaId: string): Promise<void> {
    if (this.modo.demo) return this.demo.desfazerPagamento(rifaId, reservaId);

    const reserva = await this.obterReserva(rifaId, reservaId);
    if (!reserva || reserva.status !== 'pago') return;

    const rifa = await this.obterRifa(rifaId);
    const batch = writeBatch(this.fb.db);
    batch.update(doc(this.fb.db, 'rifas', rifaId, 'reservas', reservaId), {
      status: 'reservado',
      pago_confirmado_em: null,
      pago_confirmado_por: null,
      updated_at: serverTimestamp(),
    });
    for (const n of reserva.numeros) {
      batch.update(doc(this.fb.db, 'rifas', rifaId, 'numeros', String(n)), {
        status: 'reservado' as StatusNumero,
        atualizado_em: serverTimestamp(),
      });
    }
    if (rifa) {
      batch.update(doc(this.fb.db, 'rifas', rifaId), {
        totalNumerosPagos: Math.max(0, (rifa.totalNumerosPagos ?? 0) - reserva.numeros.length),
        updated_at: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  /** Cancela uma reserva e libera os números. */
  async cancelarReserva(rifaId: string, reservaId: string): Promise<void> {
    if (this.modo.demo) return this.demo.cancelarReserva(rifaId, reservaId);

    const reserva = await this.obterReserva(rifaId, reservaId);
    if (!reserva) return;
    const rifa = await this.obterRifa(rifaId);
    if (rifa?.sorteada) throw new Error('A rifa já foi sorteada — não é possível cancelar reservas.');

    const batch = writeBatch(this.fb.db);
    for (const n of reserva.numeros) {
      batch.set(doc(this.fb.db, 'rifas', rifaId, 'numeros', String(n)), {
        numero: n,
        status: 'livre' as StatusNumero,
        reserva_id: null,
        participante_nome: null,
        participante_email: null,
        participante_telefone: null,
        participante_cidade: null,
        atualizado_em: serverTimestamp(),
      });
    }
    batch.delete(doc(this.fb.db, 'rifas', rifaId, 'reservas', reservaId));
    await batch.commit();
  }

  // ======================= ENCERRAMENTO / SORTEIO =======================

  async encerrarRifa(
    rifaId: string,
    modo: Rifa['modo_encerramento'] = 'manual',
    autor?: { id: string; nome: string },
  ): Promise<void> {
    if (this.modo.demo) return this.demo.encerrarRifa(rifaId, modo, autor);

    await updateDoc(doc(this.fb.db, 'rifas', rifaId), {
      encerrada: true,
      modo_encerramento: modo,
      encerrada_em: serverTimestamp(),
      encerrada_por: autor?.nome ?? null,
      updated_at: serverTimestamp(),
    });
  }

  /**
   * Sorteia um número entre os PAGOS (só quem teve o pagamento confirmado
   * participa). Grava o resultado e o nome do ganhador na rifa.
   */
  async sortear(
    rifaId: string,
    autor?: { id: string; nome: string },
  ): Promise<{ numero: number; ganhador: string | null }> {
    if (this.modo.demo) return this.demo.sortear(rifaId, autor);

    const rifa = await this.obterRifa(rifaId);
    if (!rifa) throw new Error('Rifa não encontrada.');
    if (!rifa.encerrada) throw new Error('Encerre a rifa antes de sortear.');
    if (rifa.sorteada) throw new Error('Esta rifa já foi sorteada.');

    const numeros = await this.listarNumeros(rifaId);
    const pagos = numeros.filter((n) => n.status === 'pago');
    if (!pagos.length) throw new Error('Nenhum número com pagamento confirmado — não há quem sorteie.');

    const escolhido = pagos[Math.floor(Math.random() * pagos.length)];

    await updateDoc(doc(this.fb.db, 'rifas', rifaId), {
      sorteada: true,
      sorteada_em: serverTimestamp(),
      sorteada_por: autor?.nome ?? null,
      numero_sorteado: escolhido.numero,
      ganhador_nome: escolhido.participante_nome ?? null,
      ganhador_reserva_id: escolhido.reserva_id ?? null,
      updated_at: serverTimestamp(),
    });

    return { numero: escolhido.numero, ganhador: escolhido.participante_nome ?? null };
  }

  /** Reabre uma rifa encerrada (apenas antes do sorteio). */
  async reabrirRifa(rifaId: string): Promise<void> {
    if (this.modo.demo) return this.demo.reabrirRifa(rifaId);

    const rifa = await this.obterRifa(rifaId);
    if (rifa?.sorteada) throw new Error('Rifa já sorteada não pode ser reaberta.');
    await updateDoc(doc(this.fb.db, 'rifas', rifaId), {
      encerrada: false,
      modo_encerramento: null,
      encerrada_em: null,
      updated_at: serverTimestamp(),
    });
  }
}
