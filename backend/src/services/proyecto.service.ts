import { conTransaccion, pool } from "../config/db.js";
import { conflicto, noEncontrado, solicitudInvalida } from "../errors.js";
import { cambiarEstado, ESTADO, historialEstados, registrarEstado } from "../repositories/estado.repository.js";
import {
  actualizarProyecto,
  asignarEmpleado,
  buscarProyecto,
  consumoPorProducto,
  empleadosDeProyecto,
  insertarProyecto,
  listarProyectos,
  modificarAsignacion,
  retirarEmpleado,
  salidasDeProyecto
} from "../repositories/proyecto.repository.js";
import { emitir } from "../realtime/socket.js";

export const listarProyectosService = (filtro: { estadoId?: number | undefined; nombre?: string | undefined }) =>
  listarProyectos(filtro);

export async function obtenerProyectoService(id: number) {
  const proyecto = await buscarProyecto(id);

  if (!proyecto) {
    throw noEncontrado("Proyecto");
  }

  return proyecto;
}

/** RF-32: detalle con empleados asignados, salidas registradas e historial de estados. */
export async function detalleProyectoService(id: number) {
  const proyecto = await obtenerProyectoService(id);
  const [empleados, salidas, historial] = await Promise.all([
    empleadosDeProyecto(id),
    salidasDeProyecto(id),
    historialEstados("proyecto", id)
  ]);

  return { ...proyecto, empleados, salidas, historial };
}

/** RF-42 */
export async function consumoProyectoService(id: number) {
  await obtenerProyectoService(id);
  return consumoPorProducto(id);
}

/** RF-30: un proyecto nuevo nace "En curso" (las salidas exigen un proyecto en curso). */
export async function crearProyectoService(nombre: string, descripcion: string) {
  const id = await conTransaccion(async (cliente) => {
    const nuevoId = await insertarProyecto(cliente, nombre, descripcion);
    await registrarEstado(cliente, "proyecto", nuevoId, ESTADO.EN_CURSO);
    return nuevoId;
  });

  emitir("movimiento:registrado", { tipo: "proyecto", id });
  return obtenerProyectoService(id);
}

/** RF-36: solo se edita un proyecto que no esté completado ni cancelado. */
async function exigirEditable(id: number) {
  const proyecto = await obtenerProyectoService(id);

  if (proyecto.estadoId === ESTADO.COMPLETADO || proyecto.estadoId === ESTADO.CANCELADO) {
    throw conflicto("No se puede editar: el proyecto está completado o cancelado");
  }
}

export async function editarProyectoService(id: number, nombre: string, descripcion: string) {
  await exigirEditable(id);
  await actualizarProyecto(id, nombre, descripcion);
  emitir("movimiento:registrado", { tipo: "proyecto", id });

  return detalleProyectoService(id);
}

async function exigirEmpleadoYTipo(empleadoId: number, tipoId: number) {
  const { rowCount: empleado } = await pool.query("SELECT 1 FROM usuarios WHERE id = $1", [empleadoId]);

  if (!empleado) {
    throw noEncontrado("Empleado");
  }

  const { rowCount: tipo } = await pool.query("SELECT 1 FROM tipos_empleado_proyecto WHERE id = $1", [tipoId]);

  if (!tipo) {
    throw solicitudInvalida("El tipo de participación indicado no existe");
  }
}

/** RF-31: asigna un empleado; rechaza la asignación duplicada. */
export async function asignarEmpleadoService(proyectoId: number, empleadoId: number, tipoId: number) {
  await exigirEditable(proyectoId);
  await exigirEmpleadoYTipo(empleadoId, tipoId);

  try {
    await asignarEmpleado(proyectoId, empleadoId, tipoId);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw conflicto("El empleado ya está asignado a este proyecto");
    }
    throw error;
  }

  return detalleProyectoService(proyectoId);
}

/** RF-38: reasigna (cambia el tipo de participación de) una asignación existente. */
export async function reasignarEmpleadoService(proyectoId: number, empleadoId: number, tipoId: number) {
  await exigirEditable(proyectoId);
  await exigirEmpleadoYTipo(empleadoId, tipoId);

  if (!(await modificarAsignacion(proyectoId, empleadoId, tipoId))) {
    throw noEncontrado("Asignación");
  }

  return detalleProyectoService(proyectoId);
}

/** RF-38: retira a un empleado del proyecto. */
export async function retirarEmpleadoService(proyectoId: number, empleadoId: number) {
  await exigirEditable(proyectoId);

  if (!(await retirarEmpleado(proyectoId, empleadoId))) {
    throw noEncontrado("Asignación");
  }

  return detalleProyectoService(proyectoId);
}

/** RF-37: cambio manual de estado, sin derivarlo del estado de sus salidas. */
export async function cambiarEstadoProyectoService(id: number, tipoEstadoId: number) {
  await cambiarEstado(pool, "proyecto", id, tipoEstadoId);
  emitir("movimiento:registrado", { tipo: "proyecto", id });

  return detalleProyectoService(id);
}
