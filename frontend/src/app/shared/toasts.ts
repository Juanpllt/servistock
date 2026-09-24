import { Component, inject } from '@angular/core';
import { Toast } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  template: `
    <div class="toasts" aria-live="polite">
      @for (aviso of toast.avisos(); track aviso.id) {
        <div class="toast" [class]="aviso.tipo" role="status" (click)="toast.cerrar(aviso.id)">
          {{ aviso.texto }}
        </div>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly toast = inject(Toast);
}
