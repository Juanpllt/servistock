import { Component, HostListener, input, output } from '@angular/core';

@Component({
  selector: 'app-modal',
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <div
        class="modal"
        [class.ancho]="ancho()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="titulo()"
        (click)="$event.stopPropagation()"
      >
        <header class="modal-cabecera">
          <h2>{{ titulo() }}</h2>
          <button type="button" class="icono" (click)="cerrar.emit()" aria-label="Cerrar">×</button>
        </header>
        <div class="modal-cuerpo"><ng-content /></div>
      </div>
    </div>
  `,
})
export class Modal {
  readonly titulo = input.required<string>();
  readonly ancho = input(false);
  readonly cerrar = output<void>();

  @HostListener('document:keydown.escape')
  protected alEscape() {
    this.cerrar.emit();
  }
}
