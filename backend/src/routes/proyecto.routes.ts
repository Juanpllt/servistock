import { Router } from "express";
import { query } from "express-validator";
import {
  asignar,
  cambiarEstado,
  consumo,
  crear,
  editar,
  listar,
  obtener,
  reasignar,
  retirar
} from "../controllers/proyecto.controller.js";
import {
  filtroEstado,
  idBody,
  idParam,
  texto,
  textoOpcional,
  validar
} from "../middlewares/validaciones.js";

const router = Router();
const datos = [texto("nombre", "El nombre", 150), textoOpcional("descripcion", "La descripción", 2000)];
const tipoParticipacion = idBody("tipoParticipacionId", "El tipo de participación es obligatorio");

router.get("/", validar(filtroEstado(), query("nombre").optional().isString().trim().isLength({ max: 150 })), listar);
router.get("/:id", validar(idParam()), obtener);
router.get("/:id/consumo", validar(idParam()), consumo);
router.post("/", validar(...datos), crear);
router.put("/:id", validar(idParam(), ...datos), editar);
router.patch("/:id/estado", validar(idParam(), idBody("tipoEstadoId", "El estado es obligatorio")), cambiarEstado);

router.post("/:id/empleados", validar(idParam(), idBody("empleadoId", "El empleado es obligatorio"), tipoParticipacion), asignar);
router.put("/:id/empleados/:empleadoId", validar(idParam(), idParam("empleadoId"), tipoParticipacion), reasignar);
router.delete("/:id/empleados/:empleadoId", validar(idParam(), idParam("empleadoId")), retirar);

export default router;
