import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface ArquivoBase64 {
  nome: string;
  tipo: string;
  /** Tamanho final em bytes do conteúdo binário. */
  tamanho: number;
  /** data URL pronta para gravar no Firestore. */
  base64: string;
}

/**
 * Prepara o comprovante de pagamento para gravação em base64 no Firestore
 * (sem Firebase Storage).
 *
 * - Imagens são redimensionadas e recomprimidas no navegador (JPEG) para caber
 *   com folga no limite de ~1 MB por documento do Firestore.
 * - PDFs são aceitos até o limite configurado.
 */
@Injectable({ providedIn: 'root' })
export class ComprovanteService {
  readonly maxBytes = environment.comprovanteMaxBytes;
  readonly maxOriginalBytes = environment.comprovanteMaxOriginalBytes;
  readonly aceitos = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

  async preparar(file: File): Promise<ArquivoBase64> {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    if (file.size > this.maxOriginalBytes) {
      throw new Error(`O arquivo tem ${this.formatarTamanho(file.size)}. O limite é ${this.formatarTamanho(this.maxOriginalBytes)}.`);
    }

    const ehPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (ehPdf) {
      const base64 = await this.lerComoDataUrl(file);
      const tamanho = this.tamanhoDoBase64(base64);
      if (tamanho > this.maxBytes) {
        throw new Error(`PDF muito grande (${this.formatarTamanho(tamanho)}). Envie um PDF de até ${this.formatarTamanho(this.maxBytes)} ou uma foto do comprovante.`);
      }
      return { nome: file.name, tipo: 'application/pdf', tamanho, base64 };
    }

    if (!file.type.startsWith('image/')) {
      throw new Error('Envie uma imagem (JPG, PNG) ou um PDF do comprovante.');
    }

    const dataUrl = await this.comprimirImagem(file);
    const tamanho = this.tamanhoDoBase64(dataUrl);
    if (tamanho > this.maxBytes) {
      throw new Error(`A imagem ficou com ${this.formatarTamanho(tamanho)} após a compressão. Tente outra foto ou envie um PDF.`);
    }
    return { nome: this.trocarExtensao(file.name, 'jpg'), tipo: 'image/jpeg', tamanho, base64: dataUrl };
  }

  /** Redimensiona para no máximo 1400px e converte para JPEG. */
  private async comprimirImagem(file: File): Promise<string> {
    const bitmap = await this.carregarImagem(file);
    const maxLado = 1400;
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível processar a imagem neste navegador.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    if ('close' in bitmap) {
      try { (bitmap as ImageBitmap).close(); } catch { /* ignora */ }
    }

    // Baixa a qualidade até caber no limite.
    for (const qualidade of [0.82, 0.72, 0.6, 0.5, 0.42]) {
      const url = canvas.toDataURL('image/jpeg', qualidade);
      if (this.tamanhoDoBase64(url) <= this.maxBytes) return url;
    }
    return canvas.toDataURL('image/jpeg', 0.35);
  }

  private async carregarImagem(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file);
      } catch {
        // HEIC e alguns formatos não são suportados — tenta via <img>.
      }
    }
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Formato de imagem não suportado. Envie JPG ou PNG.'));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  private lerComoDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  private tamanhoDoBase64(dataUrl: string): number {
    const i = dataUrl.indexOf(',');
    const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
    return Math.floor((b64.length * 3) / 4);
  }

  private trocarExtensao(nome: string, ext: string): string {
    const base = nome.replace(/\.[^.]+$/, '') || 'comprovante';
    return `${base}.${ext}`;
  }

  formatarTamanho(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Abre o comprovante em nova aba (data URL). */
  abrir(base64: string): void {
    if (!base64) return;
    const w = window.open();
    if (!w) return;
    if (base64.startsWith('data:application/pdf')) {
      w.document.write(`<embed src="${base64}" type="application/pdf" width="100%" height="100%" />`);
    } else {
      w.document.write(`<img src="${base64}" style="max-width:100%" />`);
    }
    w.document.close();
  }

  baixar(base64: string, nome: string): void {
    const a = document.createElement('a');
    a.href = base64;
    a.download = nome || 'comprovante';
    a.click();
  }
}
