import { conflicto, noEncontrado } from "../errors.js";
import {
  crearCatalogo,
  editarCatalogo,
  listarCatalogo,
  type TablaCatalogo
} from "../repositories/catalogo.repository.js";

function esDuplicado(error: unknown) {
  return (error as { code?: string }).code === "23505";
}

export const listarService = (tabla: TablaCatalogo) => listarCatalogo(tabla);

export async function crearService(tabla: TablaCatalogo, etiqueta: string, nombre: string) {
  try {
    return await crearCatalogo(tabla, nombre);
  } catch (error) {
    if (esDuplicado(error)) {
      throw conflicto(`${etiqueta} "${nombre}" ya existe`);
    }
    throw error;
  }
}

export async function editarService(
  tabla: TablaCatalogo,
  etiqueta: string,
  id: number,
  nombre: string
) {
  try {
    const item = await editarCatalogo(tabla, id, nombre);

    if (!item) {
      throw noEncontrado(etiqueta);
    }

    return item;
  } catch (error) {
    if (esDuplicado(error)) {
      throw conflicto(`${etiqueta} "${nombre}" ya existe`);
    }
    throw error;
  }
}
