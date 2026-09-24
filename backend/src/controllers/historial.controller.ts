import type { Request, Response } from "express";
import { historialEstados } from "../repositories/estado.repository.js";
import { historialPedidosPorRango } from "../repositories/historial.repository.js";
import type { Rango } from "../repositories/rango.js";
import { detalleEntradaService, listarEntradasService } from "../services/entrada.service.js";
import { obtenerPedidoService } from "../services/pedido.service.js";
import { obtenerProyectoService } from "../services/proyecto.service.js";
import { detalleSalidaService, listarSalidasService } from "../services/salida.service.js";

function rango(req: Request): Rango {
  const { desde, hasta } = req.query;

  return {
    desde: typeof desde === "string" && desde ? desde : undefined,
    hasta: typeof hasta === "string" && hasta ? hasta : undefined
  };
}

const id = (req: Request) => Number(req.params["id"]);

/** RF-50 */
export async function pedidos(req: Request, res: Response) {
  return res.json(await historialPedidosPorRango(rango(req)));
}

/** RF-49: cada cambio de estado del pedido, ordenado por fecha. */
export async function pedido(req: Request, res: Response) {
  const datos = await obtenerPedidoService(id(req));
  return res.json({ ...datos, historial: await historialEstados("pedido", id(req)) });
}

/** RF-52 */
export async function entradas(req: Request, res: Response) {
  return res.json(await listarEntradasService(undefined, rango(req)));
}

/** RF-51: líneas y registros de estado de la entrada. */
export async function entrada(req: Request, res: Response) {
  return res.json(await detalleEntradaService(id(req)));
}

/** RF-54 */
export async function salidas(req: Request, res: Response) {
  return res.json(await listarSalidasService(undefined, rango(req)));
}

/** RF-53: productos entregados y cada cambio de estado de la salida. */
export async function salida(req: Request, res: Response) {
  return res.json(await detalleSalidaService(id(req)));
}

/** RF-55 */
export async function proyecto(req: Request, res: Response) {
  const datos = await obtenerProyectoService(id(req));
  return res.json({ ...datos, historial: await historialEstados("proyecto", id(req)) });
}
