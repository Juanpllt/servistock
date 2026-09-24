import { Component, computed, input } from '@angular/core';

/** Insignia de color para un estado (En espera, En curso, Completado, Cancelado o uno nuevo del catálogo). */
@Component({
  selector: 'app-estado',
  template: `@if (texto()) {<span class="insignia" [class]="clase()">{{ texto() }}</span>}`,
})
export class EstadoInsignia {
  readonly id = input<number | null | undefined>(null);
  readonly texto = input<string | null | undefined>(null);

  protected readonly clase = computed(() => {
    switch (this.id()) {
      case 1:
        return 'espera';
      case 2:
        return 'curso';
      case 3:
        return 'completado';
      case 4:
        return 'cancelado';
      default:
        return '';
    }
  });
}
