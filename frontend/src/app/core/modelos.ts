export interface Catalogo {
  id: number;
  nombre: string;
}

/** IDs fijos del catálogo de estados (coinciden con el backend). */
export const ESTADO = { EN_ESPERA: 1, EN_CURSO: 2, COMPLETADO: 3, CANCELADO: 4 } as const;

export interface Producto {
  id: number;
  nombre: string;
  categoriaId: number;
  categoria: string;
  codigoQrBarras: string;
  cantidadMinimaStock: number;
  stockActual: number;
  stockBajo: boolean;
}

export interface CambioEstado {
  id: number;
  tipoEstadoId: number;
  estado: string;
  fechaCambio: string;
}

export interface Pedido {
  id: number;
  proveedor: string;
  empleado: string | null;
  creadoEn: string;
  estadoId: number | null;
  estado: string | null;
  totalEntradas: number;
}

export interface PedidoDetalle extends Pedido {
  entradas: { id: number; fecha: string; tipoEntrada: string; estado: string | null }[];
  historial: CambioEstado[];
}

export interface Linea {
  id: number;
  productoId: number;
  producto: string;
  codigoQrBarras: string;
  cantidad: number;
  estadoId: number | null;
  estado: string | null;
}

export interface Entrada {
  id: number;
  fecha: string;
  empleado: string;
  pedidoId: number;
  proveedor: string;
  tipoEntradaId: number;
  tipoEntrada: string;
  estadoId: number | null;
  estado: string | null;
  totalLineas: number;
}

export interface EntradaDetalle extends Entrada {
  lineas: Linea[];
  historial: CambioEstado[];
}

export interface Salida {
  id: number;
  fecha: string;
  proyectoId: number;
  proyecto: string;
  empleado: string;
  estadoId: number | null;
  estado: string | null;
  totalLineas: number;
}

export interface SalidaDetalle extends Salida {
  lineas: Linea[];
  historial: CambioEstado[];
}

export interface Proyecto {
  id: number;
  nombre: string;
  descripcion: string;
  creadoEn: string;
  estadoId: number | null;
  estado: string | null;
  totalEmpleados: number;
}

export interface EmpleadoAsignado {
  empleadoId: number;
  nombre: string;
  email: string;
  tipoParticipacionId: number;
  tipoParticipacion: string;
}

export interface ProyectoDetalle extends Proyecto {
  empleados: EmpleadoAsignado[];
  salidas: { id: number; fecha: string; empleado: string; estado: string | null; totalLineas: number }[];
  historial: CambioEstado[];
}

export interface Consumo {
  productoId: number;
  producto: string;
  codigoQrBarras: string;
  cantidadTotal: number;
}

export interface Empleado {
  id: number;
  nombre: string;
  email: string;
  rolId: number;
  rol: string;
  activo: boolean;
}

export interface Notificacion {
  tipo: 'producto' | 'pedido';
  id: number;
  referenciaId: number;
  mensaje: string;
  fecha: string;
  leida: boolean;
  categoria: string;
}

export interface Resumen {
  stockBajo: Producto[];
  proyectosEnCurso: Proyecto[];
  notificacionesNoLeidas: number;
  totales: { productos: number };
}

export interface PedidoHistorial {
  id: number;
  proveedor: string;
  estado: string | null;
  cambios: { estado: string; fechaCambio: string }[];
}

/** Respuesta de las operaciones que crean o modifican datos. */
export interface Confirmacion<T> {
  mensaje: string;
  data: T;
}
