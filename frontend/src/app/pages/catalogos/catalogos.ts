import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Catalogos as CatalogosService } from '../../core/catalogos.service';
import { Catalogo, Confirmacion } from '../../core/modelos';
import { Toast } from '../../core/toast.service';

interface Definicion {
  titulo: string;
  ruta: string;
  soloAdmin: boolean;
  ayuda?: string;
}

/** RF-13 a RF-15 (categorías) y RF-61 a RF-64 (tipos y estados): crear, consultar y editar. */
@Component({
  selector: 'app-catalogos',
  imports: [FormsModule],
  templateUrl: './catalogos.html',
})
export class Catalogos {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly compartidos = inject(CatalogosService);
  private readonly auth = inject(AuthService);

  protected readonly definiciones: Definicion[] = [
    { titulo: 'Categorías de producto', ruta: '/categorias', soloAdmin: false },
    { titulo: 'Tipos de entrada', ruta: '/catalogos/tipos-entrada', soloAdmin: true },
    { titulo: 'Tipos de participación en proyecto', ruta: '/catalogos/tipos-participacion', soloAdmin: true },
    { titulo: 'Estados', ruta: '/catalogos/estados', soloAdmin: true, ayuda: 'Los cuatro estados base se pueden renombrar; el sistema los reconoce por su identificador interno, no por el nombre.' },
    { titulo: 'Tipos de notificación de producto', ruta: '/catalogos/tipos-notificacion-producto', soloAdmin: true },
    { titulo: 'Tipos de notificación de pedido', ruta: '/catalogos/tipos-notificacion-pedido', soloAdmin: true },
  ];

  protected readonly seleccionado = signal(0);
  protected readonly items = signal<Catalogo[]>([]);
  protected readonly editandoId = signal<number | null>(null);
  protected nombreNuevo = '';
  protected nombreEditado = '';

  protected readonly actual = computed(() => this.definiciones[this.seleccionado()] as Definicion);
  protected readonly puedeEscribir = computed(() => !this.actual().soloAdmin || this.auth.esAdmin());

  constructor() {
    this.cargar();
  }

  protected elegir(indice: number) {
    this.seleccionado.set(indice);
    this.editandoId.set(null);
    this.cargar();
  }

  private cargar() {
    this.api.get<Catalogo[]>(this.actual().ruta).subscribe({
      next: (lista) => this.items.set(lista),
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }

  /** Mantiene al día los desplegables del resto de la aplicación. */
  private refrescarCompartidos() {
    this.compartidos.recargarCategorias();
    this.compartidos.recargarEstados();
    this.compartidos.recargarTiposEntrada();
    this.compartidos.recargarTiposParticipacion();
  }

  protected agregar() {
    const nombre = this.nombreNuevo.trim();

    if (!nombre) {
      this.toast.error('El nombre es obligatorio');
      return;
    }

    this.api.post<Confirmacion<Catalogo>>(this.actual().ruta, { nombre }).subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.nombreNuevo = '';
        this.cargar();
        this.refrescarCompartidos();
      },
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }

  protected editar(item: Catalogo) {
    this.editandoId.set(item.id);
    this.nombreEditado = item.nombre;
  }

  protected guardar(item: Catalogo) {
    const nombre = this.nombreEditado.trim();

    if (!nombre) {
      this.toast.error('El nombre es obligatorio');
      return;
    }

    this.api.put<Confirmacion<Catalogo>>(`${this.actual().ruta}/${item.id}`, { nombre }).subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.editandoId.set(null);
        this.cargar();
        this.refrescarCompartidos();
      },
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }
}
