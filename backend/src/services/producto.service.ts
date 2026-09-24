import { conflicto, noEncontrado, solicitudInvalida } from "../errors.js";
import {
  buscarProductoPorCodigo,
  buscarProductoPorId,
  crearProducto,
  editarProducto,
  listarProductos,
  type DatosProducto,
  type FiltroProductos
} from "../repositories/producto.repository.js";
import { emitir } from "../realtime/socket.js";

function traducirError(error: unknown): never {
  const codigo = (error as { code?: string }).code;

  if (codigo === "23505") {
    throw conflicto("El código QR/de barras ya está registrado en otro producto");
  }

  if (codigo === "23503") {
    throw solicitudInvalida("La categoría indicada no existe");
  }

  throw error;
}

export const listarProductosService = (filtro: FiltroProductos) => listarProductos(filtro);

export async function obtenerProductoService(id: number) {
  const producto = await buscarProductoPorId(id);

  if (!producto) {
    throw noEncontrado("Producto");
  }

  return producto;
}

export async function obtenerPorCodigoService(codigo: string) {
  const producto = await buscarProductoPorCodigo(codigo);

  if (!producto) {
    throw noEncontrado("Producto con ese código");
  }

  return producto;
}

function publicar(producto: { id: number; nombre: string; stockActual: number; cantidadMinimaStock: number }) {
  emitir("stock:actualizado", [producto]);
}

export async function crearProductoService(datos: DatosProducto) {
  try {
    // RF-06: el stock inicial siempre es cero; solo cambia con entradas y salidas
    const id = await crearProducto(datos);
    const producto = await obtenerProductoService(id);
    publicar(producto);
    return producto;
  } catch (error) {
    return traducirError(error);
  }
}

export async function editarProductoService(id: number, datos: DatosProducto) {
  try {
    if (!(await editarProducto(id, datos))) {
      throw noEncontrado("Producto");
    }

    const producto = await obtenerProductoService(id);
    publicar(producto);
    return producto;
  } catch (error) {
    return traducirError(error);
  }
}
