import bcrypt from "bcryptjs";
import { AppError, conflicto, noEncontrado, solicitudInvalida } from "../errors.js";
import {
  actualizarEmpleado,
  buscarEmpleado,
  cambiarRolEmpleado,
  contarAdministradores,
  crearEmpleado,
  eliminarEmpleado,
  listarEmpleados,
  proyectosDeEmpleado
} from "../repositories/empleado.repository.js";
import type { TokenPayload } from "./auth.service.js";

const RONDAS_HASH = 10;

function traducirError(error: unknown): never {
  const codigo = (error as { code?: string }).code;

  if (codigo === "23505") {
    throw conflicto("El usuario (correo) ya está en uso por otro empleado");
  }

  if (codigo === "23503") {
    throw solicitudInvalida("El tipo de empleado indicado no existe");
  }

  throw error;
}

export const listarEmpleadosService = () => listarEmpleados();

export async function obtenerEmpleadoService(id: number) {
  const empleado = await buscarEmpleado(id);

  if (!empleado) {
    throw noEncontrado("Empleado");
  }

  return empleado;
}

export async function proyectosDeEmpleadoService(id: number) {
  await obtenerEmpleadoService(id);
  return proyectosDeEmpleado(id);
}

/** RF-01: solo el Administrador (validado en la ruta) crea cuentas. */
export async function crearEmpleadoService(datos: {
  nombre: string;
  email: string;
  password: string;
  rolId: number;
}) {
  try {
    const id = await crearEmpleado({
      nombre: datos.nombre,
      email: datos.email,
      rolId: datos.rolId,
      passwordHash: await bcrypt.hash(datos.password, RONDAS_HASH)
    });

    return obtenerEmpleadoService(id);
  } catch (error) {
    return traducirError(error);
  }
}

/**
 * RF-05: el Administrador edita a cualquiera; un Empleado solo su propia cuenta.
 * El tipo de empleado NO se cambia aquí (ADR-012): existe un caso de uso separado.
 */
export async function editarEmpleadoService(
  solicitante: TokenPayload,
  id: number,
  datos: { nombre: string; email: string; password?: string | undefined }
) {
  if (solicitante.rol !== "Administrador" && solicitante.id !== id) {
    throw new AppError(403, "No tienes permiso para editar a otro empleado");
  }

  await obtenerEmpleadoService(id);

  try {
    await actualizarEmpleado(id, {
      nombre: datos.nombre,
      email: datos.email,
      passwordHash: datos.password ? await bcrypt.hash(datos.password, RONDAS_HASH) : undefined
    });

    return obtenerEmpleadoService(id);
  } catch (error) {
    return traducirError(error);
  }
}

/** ADR-012: caso de uso separado y exclusivo del Administrador. */
export async function cambiarTipoService(id: number, rolId: number) {
  const empleado = await obtenerEmpleadoService(id);

  if (empleado.rol === "Administrador" && (await contarAdministradores()) <= 1) {
    throw conflicto("No se puede cambiar el tipo del único Administrador del sistema");
  }

  try {
    await cambiarRolEmpleado(id, rolId);
    return obtenerEmpleadoService(id);
  } catch (error) {
    return traducirError(error);
  }
}

/** RF-02 / RN-13: baja física; se rechaza si el empleado ya tiene movimientos registrados. */
export async function eliminarEmpleadoService(solicitante: TokenPayload, id: number) {
  if (solicitante.id === id) {
    throw conflicto("No puedes eliminar tu propia cuenta");
  }

  const empleado = await obtenerEmpleadoService(id);

  if (empleado.rol === "Administrador" && (await contarAdministradores()) <= 1) {
    throw conflicto("No se puede eliminar al único Administrador del sistema");
  }

  try {
    await eliminarEmpleado(id);
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      throw conflicto(
        "No se puede eliminar: el empleado tiene entradas o salidas registradas a su nombre"
      );
    }
    throw error;
  }
}
