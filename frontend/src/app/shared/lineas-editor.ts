import { Component, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { Api, mensajeError } from '../core/api.service';
import { Producto } from '../core/modelos';
import { Toast } from '../core/toast.service';
import { EscanerQr } from './escaner-qr';

export interface LineaForm {
  productoId: number;
  nombre: string;
  codigo: string;
  stock: number;
  cantidad: number;
}

/**
 * Arma la lista de productos y cantidades de una entrada o una salida.
 * Cada producto se agrega escaneando su QR/código (RF-40, RF-73) o buscándolo por nombre (RF-41).
 */
@Component({
  selector: 'app-lineas-editor',
  imports: [FormsModule, EscanerQr],
  template: `
    <div class="lineas-editor">
      <div class="fila">
        <input
          class="campo"
          name="buscar"
          [ngModel]="texto()"
          (ngModelChange)="alEscribir($event)"
          (keydown.enter)="alEnter($event)"
          placeholder="Buscar por nombre, o escribir/escanear el código"
          autocomplete="off"
        />
        <button type="button" class="btn secundario" [disabled]="!habilitado()" (click)="escaner.set(true)">
          Escanear QR
        </button>
      </div>
      @if (!habilitado() && aviso()) {
        <p class="ayuda error-texto">{{ aviso() }}</p>
      }

      @if (resultados().length > 0) {
        <ul class="resultados">
          @for (p of resultados(); track p.id) {
            <li>
              <button type="button" (click)="agregar(p)">
                <strong>{{ p.nombre }}</strong>
                <small>Stock {{ p.stockActual }} · {{ p.codigoQrBarras }}</small>
              </button>
            </li>
          }
        </ul>
      }

      @if (lineas().length === 0) {
        <p class="vacio">Aún no hay productos. Busca o escanea para agregarlos.</p>
      } @else {
        <div class="tabla-envoltorio">
          <table class="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                @if (mostrarStock()) {
                  <th class="num">Disponible</th>
                }
                <th class="num">Cantidad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (l of lineas(); track l.productoId) {
                <tr>
                  <td>
                    {{ l.nombre }}<br /><small class="tenue">{{ l.codigo }}</small>
                  </td>
                  @if (mostrarStock()) {
                    <td class="num" [class.error-texto]="l.cantidad > l.stock">{{ l.stock }}</td>
                  }
                  <td class="num">
                    <input
                      class="campo cantidad"
                      type="number"
                      min="1"
                      step="1"
                      [name]="'cant-' + l.productoId"
                      [ngModel]="l.cantidad"
                      (ngModelChange)="cambiarCantidad(l.productoId, $event)"
                    />
                  </td>
                  <td class="num">
                    <button type="button" class="btn peligro chico" (click)="quitar(l.productoId)">Quitar</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (escaner()) {
      <app-escaner-qr (codigo)="agregarPorCodigo($event)" (cerrar)="escaner.set(false)" />
    }
  `,
})
export class LineasEditor {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);

  readonly lineas = model<LineaForm[]>([]);
  /** En las salidas se muestra el stock disponible junto a cada cantidad. */
  readonly mostrarStock = input(false);
  /** El escáner solo se puede abrir cuando ya se completaron los datos previos (pedido, proyecto, tipo...). */
  readonly habilitado = input(true);
  readonly aviso = input('');

  protected readonly texto = signal('');
  protected readonly resultados = signal<Producto[]>([]);
  protected readonly escaner = signal(false);

  private readonly busqueda$ = new Subject<string>();

  constructor() {
    this.busqueda$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((texto) => (texto.length >= 2 ? this.api.get<Producto[]>('/productos', { nombre: texto }) : of([]))),
      )
      .subscribe((lista) => this.resultados.set(lista.slice(0, 8)));
  }

  protected alEscribir(valor: string) {
    this.texto.set(valor);
    this.busqueda$.next(valor.trim());
  }

  /** Los lectores USB envían el código seguido de Enter: se intenta primero como código exacto. */
  protected alEnter(evento: Event) {
    evento.preventDefault();
    const valor = this.texto().trim();

    if (!valor) {
      return;
    }

    const unico = this.resultados().length === 1 ? this.resultados()[0] : undefined;

    if (unico && unico.nombre.toLowerCase() === valor.toLowerCase()) {
      this.agregar(unico);
    } else {
      this.agregarPorCodigo(valor);
    }
  }

  protected agregarPorCodigo(codigo: string) {
    this.api.get<Producto>(`/productos/codigo/${encodeURIComponent(codigo)}`).subscribe({
      next: (producto) => {
        this.agregar(producto);
        this.toast.exito(`Agregado: ${producto.nombre}`);
      },
      error: (e) => {
        // Sin coincidencia por código: si la búsqueda por nombre dio un único resultado, se usa ese
        if (this.resultados().length === 1 && this.resultados()[0]) {
          this.agregar(this.resultados()[0]);
        } else {
          this.toast.error(mensajeError(e));
        }
      },
    });
  }

  protected agregar(producto: Producto) {
    this.texto.set('');
    this.resultados.set([]);
    this.lineas.update((lista) => {
      const existente = lista.find((l) => l.productoId === producto.id);

      if (existente) {
        return lista.map((l) => (l.productoId === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      }

      return [
        ...lista,
        {
          productoId: producto.id,
          nombre: producto.nombre,
          codigo: producto.codigoQrBarras,
          stock: producto.stockActual,
          cantidad: 1,
        },
      ];
    });
  }

  protected cambiarCantidad(productoId: number, valor: number) {
    this.lineas.update((lista) =>
      lista.map((l) => (l.productoId === productoId ? { ...l, cantidad: Math.max(1, Math.floor(Number(valor)) || 1) } : l)),
    );
  }

  protected quitar(productoId: number) {
    this.lineas.update((lista) => lista.filter((l) => l.productoId !== productoId));
  }
}
