import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RifasService } from '../../core/services/rifas.service';
import { AuthService } from '../../core/services/auth.service';
import {
  Rifa, SITUACAO_RIFA_LABEL, situacaoRifa, formatarMoeda, formatarData,
} from '../../core/models/rifa.models';

/**
 * Painel do administrador.
 *  - SYSOP vê e gerencia TODAS as rifas (e pode excluir).
 *  - ADMIN/OPERATOR veem apenas as rifas que criaram.
 */

/** Painel do administrador: lista de rifas com atalhos de gestão. */
@Component({
  selector: 'app-admin-rifas',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="pagina-titulo">
      <div>
        <h1>Painel do administrador</h1>
        <p class="sub">Gerencie rifas, confirme pagamentos e realize o sorteio.</p>
      </div>
      <a class="btn" routerLink="/admin/nova">+ Nova rifa</a>
    </div>

    @if (mensagem()) { <div class="aviso" [class]="mensagemTipo()">{{ mensagem() }}</div> }

    @if (!souSysop()) {
      <p class="texto-pequeno" style="margin-top:-8px">
        Você vê e gerencia apenas as rifas que criou.
      </p>
    }

    @if (carregando()) {
      <div class="carregando"><div class="spinner"></div>Carregando…</div>
    } @else if (!rifas().length) {
      <div class="card vazio">
        <div class="icone">🎟️</div>
        <p>Nenhuma rifa cadastrada ainda.</p>
        <a class="btn mt" routerLink="/admin/nova">Criar a primeira rifa</a>
      </div>
    } @else {
      <div class="tabela-wrap card" style="padding:0">
        <table class="tabela">
          <thead>
            <tr>
              <th>Rifa</th>
              <th>Números</th>
              <th>Reservados</th>
              <th>Pagos</th>
              <th>Arrecadado</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rifas(); track r.id) {
              <tr>
                <td>
                  <div style="font-weight:600">{{ r.titulo }}</div>
                  <div class="texto-pequeno">{{ formatarData(r.created_at) }}</div>
                </td>
                <td class="num-cell">{{ r.totalNumeros }}</td>
                <td class="num-cell">{{ r.totalNumerosReservados ?? 0 }}</td>
                <td class="num-cell">{{ r.totalNumerosPagos ?? 0 }}</td>
                <td class="num-cell">
                  {{ formatarMoeda((r.valorNumero ?? 0) * (r.totalNumerosPagos ?? 0)) }}
                </td>
                <td>
                  <span class="badge" [class]="classeSituacao(r)">{{ rotuloSituacao(r) }}</span>
                </td>
                <td>
                  <div class="acoes-linha">
                    <a class="btn pequeno" [routerLink]="['/admin/rifa', r.id]">Gerenciar</a>
                    <a class="btn pequeno secundario" [routerLink]="['/admin/rifa', r.id, 'editar']">Editar</a>
                    <a class="btn pequeno secundario" [routerLink]="['/rifa', r.id]">Ver público</a>
                    @if (souSysop()) {
                      <button class="btn pequeno perigo" (click)="excluir(r)">Excluir</button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AdminRifasComponent implements OnInit, OnDestroy {
  private readonly service = inject(RifasService);
  private readonly auth = inject(AuthService);

  readonly todas = signal<Rifa[]>([]);
  readonly carregando = signal(true);
  readonly mensagem = signal('');
  readonly mensagemTipo = signal('aviso sucesso');

  /** Rifas que este usuário pode gerenciar. */
  readonly rifas = computed(() => this.filtrarVisiveis(this.todas()));

  readonly souSysop = computed(() => this.auth.sysop());

  private parar: (() => void) | null = null;

  ngOnInit(): void {
    this.parar = this.service.observarRifas((rifas) => {
      this.todas.set(rifas);
      this.carregando.set(false);
    });
    setTimeout(() => this.carregando.set(false), 8000);
  }

  /** SysOp vê tudo; os demais só as próprias rifas. */
  private filtrarVisiveis(rifas: Rifa[]): Rifa[] {
    const u = this.auth.usuario();
    if (!u) return [];
    if (u.perfil === 'SYSOP') return rifas;
    return rifas.filter((r) => this.service.ehDonoDaRifa(r, u));
  }

  async excluir(r: Rifa): Promise<void> {
    if (!this.souSysop()) return;
    const digitou = prompt(
      `Excluir DEFINITIVAMENTE a rifa "${r.titulo}"?\n\n` +
        `Isso apaga as reservas e os comprovantes. Digite EXCLUIR para confirmar.`,
    );
    if (digitou !== 'EXCLUIR') return;

    try {
      await this.service.excluirRifa(r.id);
      this.mensagem.set('Rifa excluída.');
      this.mensagemTipo.set('aviso atencao');
      setTimeout(() => this.mensagem.set(''), 5000);
    } catch {
      this.mensagem.set('Não foi possível excluir a rifa.');
      this.mensagemTipo.set('aviso erro');
    }
  }

  ngOnDestroy(): void {
    this.parar?.();
  }

  rotuloSituacao(r: Rifa): string {
    return SITUACAO_RIFA_LABEL[situacaoRifa(r)];
  }

  classeSituacao(r: Rifa): string {
    const s = situacaoRifa(r);
    if (s === 'sorteada') return 'badge badge-roxo';
    if (s === 'encerrada') return 'badge badge-cinza';
    return 'badge badge-verde';
  }

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;
}
