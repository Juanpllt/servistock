import { Component, ElementRef, OnDestroy, afterNextRender, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Modal } from './modal';

/**
 * Lee códigos QR y de barras con la cámara del dispositivo (RNF-08, @zxing/browser).
 * Solo captura el valor del código: identificar el producto y validar reglas le toca al backend (ADR-013/014).
 * Incluye entrada manual para lectores USB/Bluetooth o equipos sin cámara.
 */
@Component({
  selector: 'app-escaner-qr',
  imports: [Modal, FormsModule],
  template: `
    <app-modal titulo="Escanear código QR o de barras" (cerrar)="cerrar.emit()">
      <div class="escaner">
        <video #video class="escaner-video" muted playsinline></video>
        @if (mensaje()) {
          <p class="ayuda">{{ mensaje() }}</p>
        }
        <form class="fila" (ngSubmit)="enviarManual()">
          <input
            class="campo"
            name="manual"
            [(ngModel)]="manual"
            placeholder="O escribe / digita el código"
            autocomplete="off"
          />
          <button type="submit" class="btn">Usar código</button>
        </form>
        <label class="btn secundario">
          Subir imagen del QR o código de barras
          <input type="file" accept="image/*" hidden (change)="leerImagen($event)" />
        </label>
        @if (continuo()) {
          <p class="ayuda">Puedes escanear varios productos seguidos. Cierra la ventana al terminar.</p>
        }
      </div>
    </app-modal>
  `,
})
export class EscanerQr implements OnDestroy {
  readonly continuo = input(false);
  readonly codigo = output<string>();
  readonly cerrar = output<void>();

  protected readonly mensaje = signal('Iniciando cámara...');
  protected manual = '';

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private controles: IScannerControls | null = null;
  private ultimo = { valor: '', hora: 0 };
  private destruido = false;

  constructor() {
    afterNextRender(() => void this.iniciar());
  }

  ngOnDestroy() {
    this.destruido = true;
    this.controles?.stop();
  }

  protected enviarManual() {
    const valor = this.manual.trim();

    if (valor) {
      this.manual = '';
      this.recibir(valor);
    }
  }

  /** Lee un QR o código de barras desde una imagen guardada en el equipo (sin usar la cámara). */
  protected async leerImagen(evento: Event) {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';

    if (!archivo) {
      return;
    }

    const url = URL.createObjectURL(archivo);

    try {
      const resultado = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      this.recibir(resultado.getText());
    } catch {
      this.mensaje.set(
        'No se encontró un QR ni un código de barras legible en esa imagen. Prueba con una imagen más nítida o escribe el código.',
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async iniciar() {
    // getUserMedia solo existe en contextos seguros (HTTPS o localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      this.mensaje.set('La cámara requiere HTTPS o localhost. Escribe el código manualmente.');
      return;
    }

    try {
      const lector = new BrowserMultiFormatReader();
      const controles = await lector.decodeFromVideoDevice(undefined, this.video().nativeElement, (resultado) => {
        if (resultado) {
          this.recibir(resultado.getText());
        }
      });

      if (this.destruido) {
        controles.stop();
        return;
      }

      this.controles = controles;
      this.mensaje.set('Apunta la cámara al código.');
    } catch {
      this.mensaje.set('No se pudo abrir la cámara (revisa los permisos). Escribe el código manualmente.');
    }
  }

  private recibir(valor: string) {
    // Evita repetir el mismo código mientras sigue frente a la cámara
    const ahora = Date.now();

    if (valor === this.ultimo.valor && ahora - this.ultimo.hora < 2000) {
      return;
    }

    this.ultimo = { valor, hora: ahora };
    this.codigo.emit(valor);

    if (!this.continuo()) {
      this.cerrar.emit();
    }
  }
}
