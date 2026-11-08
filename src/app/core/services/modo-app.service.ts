import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Identifica se o app está em MODO DEMONSTRAÇÃO.
 *
 * Acontece automaticamente quando as credenciais do Firebase em
 * `environment.ts` ainda são os placeholders (apiKey começando com "SUBSTITUA"
 * ou projectId "SEU-PROJETO"). Nesse modo os dados ficam no próprio navegador,
 * para conhecer o app sem nenhuma configuração.
 *
 * Assim que as credenciais reais forem preenchidas, o modo demo desaparece
 * sozinho e tudo passa a usar o Firebase.
 */
@Injectable({ providedIn: 'root' })
export class ModoAppService {
  readonly demo = ModoAppService.detectar();

  private static detectar(): boolean {
    const apiKey = environment.firebase.apiKey ?? '';
    const projectId = environment.firebase.projectId ?? '';
    if (!apiKey || !projectId) return true;
    if (apiKey.startsWith('SUBSTITUA')) return true;
    if (projectId.startsWith('SEU-PROJETO')) return true;
    return apiKey.includes('xxxxxxxx');
  }
}
