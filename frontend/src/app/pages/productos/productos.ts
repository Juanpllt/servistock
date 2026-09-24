import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import QRCode from 'qrcode';
import { Api, mensajeError } from '../../core/api.service';
import { Catalogos } from '../../core/catalogos.service';
import { Confirmacion, Producto } from '../../core/modelos';
import { Realtime } from '../../core/realtime.service';
import { Toast } from '../../core/toast.service';
import { EscanerQr } from '../../shared/escaner-qr';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-productos',
  imports: [FormsModule, Modal, EscanerQr],
  templateUrl: './productos.html',
})
export class Productos implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly route = inject(ActivatedRoute);
  protected readonly catalogos = inject(Catalogos);

  protected readonly productos = signal<Producto[]>([]);
  protected readonly cargando = signal(true);
  protected readonly buscar = signal('');
  protected readonly categoriaFiltro = signal<number | ''>('');

  // Modales
  protected readonly detalle = signal<Producto | null>(null);
  protected readonly qrImagen = signal('');
  protected readonly formulario = signal<'nuevo' | Producto | null>(null);
  protected readonly escaner = signal(false);
  protected readonly escanerFormulario = signal(false);
  protected readonly guardando = signal(false);

  // Campos del formulario
  protected nombre = '';
  protected categoriaId: number | null = null;
  protected codigo = '';
  protected minimo = 0;

  constructor() {
    // Reactividad: el stock se actualiza en la tabla cuando el backend confirma un movimiento
    inject(Realtime)
      .stock$.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((cambios) => {
        this.productos.update((lista) =>
          lista.map((p) => {
            const c = cambios.find((x) => x.id === p.id);
            return c
              ? { ...p, stockActual: c.stockActual, cantidadMinimaStock: c.cantidadMinimaStock, stockBajo: c.stockActual <= c.cantidadMinimaStock }
              : p;
          }),
        );

        const abierto = this.detalle();
        const c = abierto && cambios.find((x) => x.id === abierto.id);

        if (abierto && c) {
          this.detalle.set({ ...abierto, stockActual: c.stockActual, stockBajo: c.stockActual <= c.cantidadMinimaStock });
        }
      });
  }

  ngOnInit() {
    this.cargar();

    if (this.route.snapshot.queryParamMap.get('escanear')) {
      this.escaner.set(true);
    }
  }

  protected cargar() {
    this.cargando.set(true);
    this.api
      .get<Producto[]>('/productos', { nombre: this.buscar().trim(), categoriaId: this.categoriaFiltro() })
      .subscribe({
        next: (lista) => {
          this.productos.set(lista);
          this.cargando.set(false);
        },
        error: (e) => {
          this.toast.error(mensajeError(e));
          this.cargando.set(false);
        },
      });
  }

  /** RF-08: consulta el producto con el valor leído del QR/código de barras. */
  protected consultarPorCodigo(codigo: string) {
    this.api.get<Producto>(`/productos/codigo/${encodeURIComponent(codigo)}`).subscribe({
      next: (producto) => {
        this.escaner.set(false);
        this.ver(producto);
      },
      error: (e) => {
        this.escaner.set(false);
        this.toast.error(mensajeError(e));
      },
    });
  }

  protected async ver(producto: Producto) {
    this.detalle.set(producto);
    this.qrImagen.set(await QRCode.toDataURL(producto.codigoQrBarras, { width: 240, margin: 1 }));
  }

  protected abrirFormulario(producto?: Producto) {
    this.formulario.set(producto ?? 'nuevo');
    this.nombre = producto?.nombre ?? '';
    this.categoriaId = producto?.categoriaId ?? this.catalogos.categorias()[0]?.id ?? null;
    this.codigo = producto?.codigoQrBarras ?? '';
    this.minimo = producto?.cantidadMinimaStock ?? 0;
  }

  protected guardar() {
    const editando = this.formulario();
    const datos = {
      nombre: this.nombre.trim(),
      categoriaId: this.categoriaId,
      codigoQrBarras: this.codigo.trim(),
      cantidadMinimaStock: this.minimo,
    };

    // RF-06: se indica el campo faltante antes de llamar al servidor
    if (!datos.nombre) return this.toast.error('El nombre es obligatorio');
    if (!datos.categoriaId) return this.toast.error('La categoría es obligatoria');
    if (!datos.codigoQrBarras) return this.toast.error('El código QR/de barras es obligatorio');

    this.guardando.set(true);
    const peticion =
      editando && editando !== 'nuevo'
        ? this.api.put<Confirmacion<Producto>>(`/productos/${editando.id}`, datos)
        : this.api.post<Confirmacion<Producto>>('/productos', datos);

    peticion.subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.formulario.set(null);
        this.guardando.set(false);
        this.cargar();

        // Al crear un producto se muestra de inmediato su QR para descargarlo e imprimirlo
        if (editando === 'nuevo') {
          void this.ver(r.data);
        }
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.guardando.set(false);
      },
    });
  }

  /** El escáner se abre al final: primero deben estar el nombre y la categoría del producto. */
  protected abrirEscanerFormulario() {
    if (!this.nombre.trim()) {
      this.toast.error('Primero escribe el nombre del producto y elige su categoría; luego escanea el código.');
      return;
    }

    if (!this.categoriaId) {
      this.toast.error('Primero elige la categoría del producto; luego escanea el código.');
      return;
    }

    this.escanerFormulario.set(true);
  }

  /** Toma el valor leído por el escáner como código del producto que se está creando o editando. */
  protected usarCodigoEscaneado(codigo: string) {
    this.escanerFormulario.set(false);
    this.codigo = codigo;

    // Avisa de inmediato si ese código ya pertenece a otro producto
    this.api.get<Producto>(`/productos/codigo/${encodeURIComponent(codigo)}`).subscribe({
      next: (existente) => {
        const editando = this.formulario();
        const esElMismo = editando && editando !== 'nuevo' && editando.id === existente.id;

        if (esElMismo) {
          this.toast.info(`Código leído: ${codigo}`);
        } else {
          this.toast.error(`Ese código ya está registrado en «${existente.nombre}»`);
        }
      },
      error: () => this.toast.exito(`Código leído: ${codigo}`),
    });
  }

  /** Crea un código único y legible (el backend rechaza duplicados con 409). */
  protected generarCodigo() {
    const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.codigo = `PRD-${Date.now().toString(36).toUpperCase()}${azar}`;
  }

  /** Copia el código como texto para pegarlo donde haga falta. */
  protected async copiarCodigo(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      this.toast.exito(`Código copiado: ${texto}`);
    } catch {
      this.toast.error('No se pudo copiar. Selecciona el código y usa Ctrl+C.');
    }
  }

  /** Copia la imagen del QR al portapapeles para pegarla en Word, WhatsApp, etc. */
  protected async copiarQr() {
    try {
      const blob = await (await fetch(this.qrImagen())).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      this.toast.exito('QR copiado. Ya puedes pegarlo.');
    } catch {
      this.toast.error('No se pudo copiar. Usa clic derecho sobre la imagen → Copiar imagen, o descárgalo.');
    }
  }

  protected descargarQr() {
    const producto = this.detalle();

    if (producto) {
      const enlace = document.createElement('a');
      enlace.href = this.qrImagen();
      enlace.download = `qr-${producto.codigoQrBarras}.png`;
      enlace.click();
    }
  }
}
