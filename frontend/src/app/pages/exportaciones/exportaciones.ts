import { Component, inject, signal } from '@angular/core';
import { Api, mensajeError } from '../../core/api.service';
import { Toast } from '../../core/toast.service';

interface Exportacion {
  tipo: string;
  titulo: string;
  descripcion: string;
}

/** RF-67 a RF-71: exportación a Excel (XLSX generado en streaming por el backend). */
@Component({
  selector: 'app-exportaciones',
  templateUrl: './exportaciones.html',
})
export class Exportaciones {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);

  protected readonly descargando = signal<string | null>(null);

  protected readonly opciones: Exportacion[] = [
    { tipo: 'inventario', titulo: 'Inventario actual', descripcion: 'Cada producto con su stock actual y mínimo.' },
    { tipo: 'pedidos', titulo: 'Historial de pedidos', descripcion: 'Pedidos con su estado actual y todos sus cambios de estado.' },
    { tipo: 'entradas', titulo: 'Historial de entradas', descripcion: 'Cada entrada con el detalle de sus líneas de producto.' },
    { tipo: 'salidas', titulo: 'Historial de salidas', descripcion: 'Cada salida con el detalle de sus líneas de producto.' },
    { tipo: 'proyectos', titulo: 'Proyectos y materiales', descripcion: 'Cada proyecto con los productos y cantidades usados.' },
  ];

  protected exportar(opcion: Exportacion) {
    this.descargando.set(opcion.tipo);

    this.api.descargar(`/exportaciones/${opcion.tipo}`).subscribe({
      next: (respuesta) => {
        this.descargando.set(null);

        if (!respuesta.body) {
          this.toast.error('No se pudo generar el archivo');
          return;
        }

        const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
        const nombre = /filename="?([^";]+)"?/.exec(disposicion)?.[1] ?? `servistock-${opcion.tipo}.xlsx`;
        const url = URL.createObjectURL(respuesta.body);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        enlace.click();
        URL.revokeObjectURL(url);

        if (respuesta.headers.get('X-Exportacion-Vacia') === 'true') {
          this.toast.info('No hay datos para exportar: el archivo solo contiene los encabezados');
        } else {
          this.toast.exito('Exportación generada correctamente');
        }
      },
      error: (e) => {
        this.descargando.set(null);
        this.toast.error(mensajeError(e));
      },
    });
  }
}
