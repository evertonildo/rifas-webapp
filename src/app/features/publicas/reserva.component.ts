import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RifasService } from '../../core/services/rifas.service';
import { ComprovanteService } from '../../core/services/comprovante.service';
import { Rifa, Reserva, formatarMoeda, formatarData } from '../../core/models/rifa.models';

/**
 * Página da reserva (link privado do participante):
 * mostra os números, o status do pagamento e permite anexar o comprovante
 * (imagem ou PDF), enviado em base64 para o Firestore.
 */
@Component({
  selector: 'app-reserva',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    @if (carregando()) {
      <div class="carregando"><div class="spinner"></div>Carregando sua reserva…</div>
    } @else if (!reserva()) {
      <div class="card vazio">
        <div class="icone">🔍</div>
        <p>Reserva não encontrada.</p>
        <a class="btn secundario" routerLink="/">Voltar para as rifas</a>
      </div>
    } @else if (reserva(); as rv) {
      <div class="pagina-titulo">
        <div>
          @if (rifa(); as r) {
            <a [routerLink]="['/rifa', r.id]" class="texto-pequeno">← {{ r.titulo }}</a>
          }
          <h1 style="margin-top:4px">Sua reserva</h1>
          <p class="sub">Guardamos este link para você acompanhar e enviar o comprovante.</p>
        </div>
        <span class="badge" [class]="rv.status === 'pago' ? 'badge badge-verde' : 'badge badge-amarelo'">
          {{ rv.status === 'pago' ? '✓ Pagamento confirmado' : '⏳ Aguardando pagamento' }}
        </span>
      </div>

      @if (mensagem()) {
        <div class="aviso" [class]="mensagemTipo()">{{ mensagem() }}</div>
      }

      <div class="painel-linha">
        <div>
          <div class="card">
            <div class="card-titulo"><h2>Números reservados</h2></div>
            <div class="flex">
              @for (n of rv.numeros; track n) {
                <span class="badge" style="font-size:1rem;padding:8px 14px"
                      [class]="rv.status === 'pago' ? 'badge badge-verde' : 'badge badge-amarelo'">
                  {{ pad(n) }}
                </span>
              }
            </div>
            <div class="divisor"></div>
            <div class="flex entre">
              <span class="texto-pequeno">Valor total</span>
              <span class="moeda">{{ formatarMoeda(rv.valor_total) }}</span>
            </div>
            <div class="flex entre mt-pequeno">
              <span class="texto-pequeno">Participante</span>
              <span style="font-size:.9rem">{{ rv.participante.nome }}</span>
            </div>
            <div class="flex entre mt-pequeno">
              <span class="texto-pequeno">Reservado em</span>
              <span style="font-size:.9rem">{{ formatarData(rv.created_at) }}</span>
            </div>
            @if (rv.pago_confirmado_em) {
              <div class="flex entre mt-pequeno">
                <span class="texto-pequeno">Pago em</span>
                <span style="font-size:.9rem">{{ formatarData(rv.pago_confirmado_em) }}</span>
              </div>
            }
          </div>

          @if (rifa(); as r) {
            @if (r.chave_pix || r.instrucoes_pagamento) {
              <div class="card">
                <div class="card-titulo"><h2>💳 Como pagar</h2></div>
                @if (r.chave_pix) {
                  <div class="campo">
                    <label>Chave PIX</label>
                    <div class="flex">
                      <input readonly [value]="r.chave_pix" style="flex:1" />
                      <button class="btn pequeno secundario" (click)="copiar(r.chave_pix!)">Copiar</button>
                    </div>
                  </div>
                }
                @if (r.valorNumero) {
                  <p class="texto-pequeno">
                    Valor por número: <b>{{ formatarMoeda(r.valorNumero) }}</b> ·
                    Total desta reserva: <b>{{ formatarMoeda(r.valorNumero * rv.numeros.length) }}</b>
                  </p>
                }
                @if (r.instrucoes_pagamento) {
                  <p class="texto-pequeno" style="white-space:pre-line">{{ r.instrucoes_pagamento }}</p>
                }
              </div>
            }
          }
        </div>

        <div>
          <div class="card">
            <div class="card-titulo">
              <h2>Comprovante de pagamento</h2>
            </div>

            @if (rv.status === 'pago') {
              <div class="aviso sucesso" style="margin-bottom:12px">
                Pagamento confirmado pelo administrador. Sua participação está garantida! 🎉
              </div>
            }

            @if (rv.comprovante_enviado_em) {
              <div class="aviso info" style="margin-bottom:12px">
                Comprovante enviado em {{ formatarData(rv.comprovante_enviado_em) }}
                @if (rv.comprovante_nome) { <div class="texto-pequeno">{{ rv.comprovante_nome }}</div> }
              </div>
              <div class="flex mb">
                <button class="btn pequeno secundario" (click)="verComprovante()">👁️ Ver comprovante</button>
                <button class="btn pequeno secundario" (click)="baixarComprovante()">⬇️ Baixar</button>
              </div>
            }

            @if (rv.status !== 'pago') {
              <div class="campo">
                <label for="arquivo">Anexar imagem ou PDF</label>
                <input
                  id="arquivo"
                  type="file"
                  [accept]="comprovanteSrv.aceitos"
                  (change)="selecionarArquivo($event)"
                />
                <div class="dica">
                  Aceita JPG, PNG ou PDF. A imagem é comprimida automaticamente
                  (limite de {{ comprovanteSrv.formatarTamanho(comprovanteSrv.maxBytes) }}).
                </div>
              </div>

              @if (previa()) {
                <div class="comprovante-preview mb">
                  <img [src]="previa()!" alt="Prévia do comprovante" />
                  <div class="texto-pequeno mt-pequeno">{{ nomeArquivo() }} · {{ tamanhoArquivo() }}</div>
                </div>
              }

              <button class="btn largo" [disabled]="!previa() || enviando()" (click)="enviar()">
                {{ enviando() ? 'Enviando…' : (rv.comprovante_enviado_em ? 'Substituir comprovante' : 'Enviar comprovante') }}
              </button>
            }
          </div>

          @if (rv.status !== 'pago') {
            <div class="card">
              <p class="texto-pequeno" style="margin:0">
                A participação só é confirmada depois que o administrador validar o pagamento.
                Você pode acompanhar por este link a qualquer momento.
              </p>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ReservaComponent implements OnInit, OnDestroy {
  private readonly service = inject(RifasService);
  private readonly rota = inject(ActivatedRoute);
  readonly comprovanteSrv = inject(ComprovanteService);

  readonly reserva = signal<Reserva | null>(null);
  readonly rifa = signal<Rifa | null>(null);
  readonly carregando = signal(true);
  readonly previa = signal<string | null>(null);
  readonly nomeArquivo = signal('');
  readonly tamanhoArquivo = signal('');
  readonly enviando = signal(false);
  readonly mensagem = signal('');
  readonly mensagemTipo = signal('aviso info');

  private rifaId = '';
  private reservaId = '';
  private token = '';
  private comprovanteBase64: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.rifaId = this.rota.snapshot.paramMap.get('rifaId') ?? '';
    this.reservaId = this.rota.snapshot.paramMap.get('reservaId') ?? '';
    this.token = this.rota.snapshot.queryParamMap.get('t') ?? '';

    this.carregar();

    // Acompanha a confirmação do pagamento pelo admin.
    this.timer = setInterval(() => this.carregar(true), 25000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async carregar(silencioso = false): Promise<void> {
    try {
      const rv = await this.service.obterReserva(this.rifaId, this.reservaId);
      this.reserva.set(rv);
      if (!this.rifa()) {
        const r = await this.service.obterRifa(this.rifaId);
        this.rifa.set(r);
      }
    } catch (e) {
      if (!silencioso) {
        this.mensagem.set('Não foi possível carregar a reserva. Verifique sua conexão.');
        this.mensagemTipo.set('aviso erro');
      }
    } finally {
      this.carregando.set(false);
    }
  }

  pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  copiar(texto: string): void {
    navigator.clipboard?.writeText(texto);
    this.mensagem.set('Chave PIX copiada.');
    this.mensagemTipo.set('aviso info');
    setTimeout(() => this.mensagem.set(''), 3000);
  }

  async selecionarArquivo(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;

    this.mensagem.set('');
    try {
      const preparado = await this.comprovanteSrv.preparar(arquivo);
      this.comprovanteBase64 = preparado.base64;
      this.previa.set(preparado.base64.startsWith('data:application/pdf') ? null : preparado.base64);
      this.nomeArquivo.set(preparado.nome);
      this.tamanhoArquivo.set(this.comprovanteSrv.formatarTamanho(preparado.tamanho));
      if (preparado.base64.startsWith('data:application/pdf')) {
        this.previa.set(preparado.base64);
      }
    } catch (e) {
      this.comprovanteBase64 = null;
      this.previa.set(null);
      this.mensagem.set(e instanceof Error ? e.message : 'Arquivo inválido.');
      this.mensagemTipo.set('aviso erro');
    }
  }

  async enviar(): Promise<void> {
    if (!this.comprovanteBase64) return;
    this.enviando.set(true);
    this.mensagem.set('');
    try {
      await this.service.enviarComprovante(this.rifaId, this.reservaId, this.token, {
        nome: this.nomeArquivo(),
        tipo: this.comprovanteBase64.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg',
        tamanho: Math.floor((this.comprovanteBase64.length * 3) / 4),
        base64: this.comprovanteBase64,
      });
      this.mensagem.set('Comprovante enviado! O administrador vai validar o pagamento.');
      this.mensagemTipo.set('aviso sucesso');
      await this.carregar(true);
    } catch (e) {
      this.mensagem.set(e instanceof Error ? e.message : 'Não foi possível enviar o comprovante.');
      this.mensagemTipo.set('aviso erro');
    } finally {
      this.enviando.set(false);
    }
  }

  async verComprovante(): Promise<void> {
    const c = await this.service.obterComprovante(this.rifaId, this.reservaId);
    if (c) this.comprovanteSrv.abrir(c.base64);
  }

  async baixarComprovante(): Promise<void> {
    const c = await this.service.obterComprovante(this.rifaId, this.reservaId);
    if (c) this.comprovanteSrv.baixar(c.base64, c.nome);
  }

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;
}
