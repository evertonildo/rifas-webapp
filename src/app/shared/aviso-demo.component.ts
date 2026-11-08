import { Component, inject } from '@angular/core';
import { ModoAppService } from '../core/services/modo-app.service';
import { DemoStore } from '../core/demo/demo-store';

/**
 * Faixa exibida apenas no MODO DEMONSTRAÇÃO (Firebase sem credenciais).
 * Deixa claro que nada é gravado na nuvem e permite zerar os dados de exemplo.
 */
@Component({
  selector: 'app-aviso-demo',
  standalone: true,
  template: `
    @if (modo.demo) {
      <div class="aviso atencao" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="font-size:1.2rem">🧪</span>
        <div style="flex:1;min-width:220px">
          <b>Modo demonstração</b> — os dados ficam só neste navegador.
          Preencha as credenciais do Firebase em <code>src/environments/environment.ts</code>
          para usar a nuvem de verdade.
        </div>
        <button class="btn pequeno secundario" (click)="reiniciar()">Zerar dados de exemplo</button>
      </div>
    }
  `,
})
export class AvisoDemoComponent {
  readonly modo = inject(ModoAppService);
  private readonly demo = inject(DemoStore);

  reiniciar(): void {
    if (!confirm('Apagar os dados de demonstração deste navegador e recomeçar?')) return;
    this.demo.reiniciar();
    location.reload();
  }
}
