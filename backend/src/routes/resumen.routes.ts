import { Router } from "express";
import { ESTADO } from "../repositories/estado.repository.js";
import { contarNoLeidas } from "../repositories/notificacion.repository.js";
import { listarProductos } from "../repositories/producto.repository.js";
import { listarProyectos } from "../repositories/proyecto.repository.js";

const router = Router();

/** RF-72: resumen al iniciar sesión — productos en stock bajo y proyectos en curso. */
router.get("/", async (_req, res) => {
  const [productos, proyectosEnCurso, noLeidas] = await Promise.all([
    listarProductos({}),
    listarProyectos({ estadoId: ESTADO.EN_CURSO }),
    contarNoLeidas()
  ]);

  const stockBajo = productos
    .filter((p) => p.stockBajo)
    .sort((a, b) => a.stockActual - a.cantidadMinimaStock - (b.stockActual - b.cantidadMinimaStock));

  return res.json({
    stockBajo,
    proyectosEnCurso,
    notificacionesNoLeidas: noLeidas,
    totales: { productos: productos.length }
  });
});

export default router;
