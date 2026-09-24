// Endpoints del dominio (inventario) descritos a partir de una tabla compacta.
// El código de estado de éxito y los errores comunes se completan automáticamente.
type Metodo = "get" | "post" | "put" | "patch" | "delete";
type Tipo = "string" | "integer" | "array";

interface Opciones {
  /** Campos del cuerpo JSON: nombre -> tipo. Los que terminan en "?" son opcionales. */
  cuerpo?: Record<string, Tipo>;
  /** Parámetros de consulta (query string). */
  consulta?: string[];
  admin?: boolean;
  exito?: string;
  descripcion?: string;
}

type Definicion = [Metodo, string, string, string, Opciones?];

const LINEAS = { lineas: "array" as Tipo };
const ESTADO = { tipoEstadoId: "integer" as Tipo };
const RANGO = ["desde", "hasta"];

const DEFINICIONES: Definicion[] = [
  // Empleados -------------------------------------------------------------------
  ["get", "/api/empleados", "Empleados", "Listar empleados (RF-04)"],
  ["get", "/api/empleados/{id}", "Empleados", "Consultar un empleado (RF-03)"],
  ["get", "/api/empleados/{id}/proyectos", "Empleados", "Proyectos en los que participa un empleado (RF-74)"],
  ["post", "/api/empleados", "Empleados", "Crear cuenta de empleado. Solo Administrador (RF-01)", { admin: true, cuerpo: { nombre: "string", email: "string", password: "string", rolId: "integer" } }],
  ["put", "/api/empleados/{id}", "Empleados", "Editar empleado: un Administrador a cualquiera, un Empleado solo a sí mismo (RF-05)", { cuerpo: { nombre: "string", email: "string", "password?": "string" } }],
  ["patch", "/api/empleados/{id}/tipo", "Empleados", "Cambiar el tipo de empleado. Solo Administrador (ADR-012)", { admin: true, cuerpo: { rolId: "integer" } }],
  ["delete", "/api/empleados/{id}", "Empleados", "Eliminar empleado (baja física). Solo Administrador (RF-02)", { admin: true }],

  // Productos y categorías ------------------------------------------------------
  ["get", "/api/productos", "Productos", "Listar productos, con filtros por nombre y categoría (RF-09, 10, 11)", { consulta: ["nombre", "categoriaId"] }],
  ["get", "/api/productos/codigo/{codigo}", "Productos", "Consultar un producto por su código QR o de barras (RF-08)"],
  ["get", "/api/productos/{id}", "Productos", "Detalle y stock actual de un producto (RF-07)"],
  ["post", "/api/productos", "Productos", "Crear producto con stock inicial 0 (RF-06)", { cuerpo: { nombre: "string", categoriaId: "integer", codigoQrBarras: "string", cantidadMinimaStock: "integer" } }],
  ["put", "/api/productos/{id}", "Productos", "Editar producto; el stock solo cambia con movimientos (RF-12)", { cuerpo: { nombre: "string", categoriaId: "integer", codigoQrBarras: "string", cantidadMinimaStock: "integer" } }],
  ["get", "/api/categorias", "Catálogos", "Listar categorías de producto (RF-14)"],
  ["post", "/api/categorias", "Catálogos", "Crear categoría (RF-13)", { cuerpo: { nombre: "string" } }],
  ["put", "/api/categorias/{id}", "Catálogos", "Editar categoría (RF-15)", { cuerpo: { nombre: "string" } }],

  // Pedidos ---------------------------------------------------------------------
  ["get", "/api/pedidos", "Pedidos", "Listar pedidos, con filtro por estado (RF-18, 19)", { consulta: ["estadoId"] }],
  ["get", "/api/pedidos/{id}", "Pedidos", "Detalle del pedido con sus entradas e historial de estados (RF-17)"],
  ["post", "/api/pedidos", "Pedidos", "Crear pedido en estado «En espera» y notificar (RF-16, 57)", { cuerpo: { proveedor: "string" } }],
  ["put", "/api/pedidos/{id}", "Pedidos", "Editar pedido; rechazado si ya tiene entradas (RF-20)", { cuerpo: { proveedor: "string" } }],
  ["patch", "/api/pedidos/{id}/estado", "Pedidos", "Cambiar el estado a mano y notificar (RF-21, 58)", { cuerpo: ESTADO }],

  // Entradas --------------------------------------------------------------------
  ["get", "/api/entradas", "Entradas", "Listar entradas, con filtro por estado (RF-24, 25)", { consulta: ["estadoId"] }],
  ["get", "/api/entradas/{id}", "Entradas", "Detalle con líneas y su estado (RF-23)"],
  ["post", "/api/entradas", "Entradas", "Registrar una entrada asociada a un pedido: suma el stock en una transacción ACID (RF-22, ADR-015)", { cuerpo: { pedidoId: "integer", tipoEntradaId: "integer", ...LINEAS } }],
  ["put", "/api/entradas/{id}", "Entradas", "Editar el encabezado si no está completada (RF-26)", { cuerpo: { pedidoId: "integer", tipoEntradaId: "integer" } }],
  ["put", "/api/entradas/{id}/lineas/{lineaId}", "Entradas", "Editar la cantidad de una línea no completada (RF-26)", { cuerpo: { cantidad: "integer" } }],
  ["patch", "/api/entradas/{id}/estado", "Entradas", "Cambiar el estado de la entrada a mano (RF-28)", { cuerpo: ESTADO }],
  ["patch", "/api/entradas/{id}/lineas/{lineaId}/estado", "Entradas", "Cambiar el estado de una línea a mano (RF-27)", { cuerpo: ESTADO }],

  // Proyectos -------------------------------------------------------------------
  ["get", "/api/proyectos", "Proyectos", "Listar proyectos, con filtros por estado y nombre (RF-33, 34, 35)", { consulta: ["estadoId", "nombre"] }],
  ["get", "/api/proyectos/{id}", "Proyectos", "Detalle con empleados, salidas e historial (RF-32)"],
  ["get", "/api/proyectos/{id}/consumo", "Proyectos", "Cantidad total usada por producto en el proyecto (RF-42)"],
  ["post", "/api/proyectos", "Proyectos", "Crear proyecto (queda «En curso») (RF-30)", { cuerpo: { nombre: "string", "descripcion?": "string" } }],
  ["put", "/api/proyectos/{id}", "Proyectos", "Editar un proyecto que no esté completado ni cancelado (RF-36)", { cuerpo: { nombre: "string", "descripcion?": "string" } }],
  ["patch", "/api/proyectos/{id}/estado", "Proyectos", "Cambiar el estado a mano (RF-37)", { cuerpo: ESTADO }],
  ["post", "/api/proyectos/{id}/empleados", "Proyectos", "Asignar un empleado; rechaza duplicados (RF-31)", { cuerpo: { empleadoId: "integer", tipoParticipacionId: "integer" } }],
  ["put", "/api/proyectos/{id}/empleados/{empleadoId}", "Proyectos", "Reasignar el tipo de participación (RF-38)", { cuerpo: { tipoParticipacionId: "integer" } }],
  ["delete", "/api/proyectos/{id}/empleados/{empleadoId}", "Proyectos", "Retirar a un empleado del proyecto (RF-38)"],

  // Salidas ---------------------------------------------------------------------
  ["get", "/api/salidas", "Salidas", "Listar salidas, con filtro por estado (RF-45, 46)", { consulta: ["estadoId"] }],
  ["get", "/api/salidas/{id}", "Salidas", "Detalle con líneas y su estado (RF-43)"],
  ["post", "/api/salidas", "Salidas", "Registrar una salida de un proyecto en curso. Valida el stock con bloqueo pesimista; si falta, rollback completo (RF-39, ADR-001/002)", { cuerpo: { proyectoId: "integer", ...LINEAS } }],
  ["put", "/api/salidas/{id}", "Salidas", "Cambiar el proyecto de una salida no completada (RF-47)", { cuerpo: { proyectoId: "integer" } }],
  ["put", "/api/salidas/{id}/lineas/{lineaId}", "Salidas", "Editar la cantidad de una línea no completada (RF-47)", { cuerpo: { cantidad: "integer" } }],
  ["patch", "/api/salidas/{id}/estado", "Salidas", "Cambiar el estado de la salida a mano (RF-48)", { cuerpo: ESTADO }],
  ["patch", "/api/salidas/{id}/lineas/{lineaId}/estado", "Salidas", "Cambiar el estado de una línea a mano (RF-44)", { cuerpo: ESTADO }],

  // Historial, resumen y notificaciones ------------------------------------------
  ["get", "/api/historial/pedidos", "Historial", "Pedidos con movimientos en un rango de fechas (RF-50)", { consulta: RANGO }],
  ["get", "/api/historial/pedidos/{id}", "Historial", "Cambios de estado de un pedido (RF-49)"],
  ["get", "/api/historial/entradas", "Historial", "Entradas en un rango de fechas (RF-52)", { consulta: RANGO }],
  ["get", "/api/historial/entradas/{id}", "Historial", "Líneas y registros de estado de una entrada (RF-51)"],
  ["get", "/api/historial/salidas", "Historial", "Salidas en un rango de fechas (RF-54)", { consulta: RANGO }],
  ["get", "/api/historial/salidas/{id}", "Historial", "Productos entregados y registros de estado de una salida (RF-53)"],
  ["get", "/api/historial/proyectos/{id}", "Historial", "Cambios de estado de un proyecto (RF-55)"],
  ["get", "/api/resumen", "Inicio", "Productos en stock bajo y proyectos en curso (RF-72)"],
  ["get", "/api/notificaciones", "Notificaciones", "Notificaciones de producto y de pedido, por fecha (RF-59)", { consulta: ["soloNoLeidas"] }],
  ["patch", "/api/notificaciones/{tipo}/{id}/leida", "Notificaciones", "Marcar una notificación como leída; tipo = producto | pedido (RF-60)"],
  ["get", "/api/exportaciones/{tipo}", "Exportaciones", "Descargar XLSX en streaming: pedidos | entradas | salidas | proyectos | inventario. Cabecera X-Exportacion-Vacia=true si no hay datos (RF-67 a 71)", { descripcion: "Archivo .xlsx" }],
  ["get", "/api/salud", "Sistema", "Health check con verificación de la base de datos"],

  // Catálogos (lectura para todos; escritura solo Administrador) --------------------
  ...(
    [
      ["tipos-entrada", "tipos de entrada (RF-61)"],
      ["tipos-participacion", "tipos de participación en proyecto (RF-62)"],
      ["tipos-notificacion-producto", "tipos de notificación de producto (RF-63)"],
      ["tipos-notificacion-pedido", "tipos de notificación de pedido (RF-63)"],
      ["estados", "valores del catálogo de estados (RF-64)"]
    ] as const
  ).flatMap(([slug, texto]): Definicion[] => [
    ["get", `/api/catalogos/${slug}`, "Catálogos", `Listar ${texto}`],
    ["post", `/api/catalogos/${slug}`, "Catálogos", `Crear en ${texto}. Solo Administrador`, { admin: true, cuerpo: { nombre: "string" } }],
    ["put", `/api/catalogos/${slug}/{id}`, "Catálogos", `Editar ${texto}. Solo Administrador`, { admin: true, cuerpo: { nombre: "string" } }]
  ]),
  ["get", "/api/catalogos/tipos-empleado", "Catálogos", "Listar tipos de empleado (solo lectura, RN-12)"]
];

const ejemplo: Record<Tipo, unknown> = { string: "texto", integer: 1, array: [] };

function parametros(ruta: string, consulta: string[] = []) {
  const deRuta = [...ruta.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: ["codigo", "tipo"].includes(m[1] ?? "") ? "string" : "integer" }
  }));
  const deConsulta = consulta.map((name) => ({ name, in: "query", required: false, schema: { type: "string" } }));

  return [...deRuta, ...deConsulta];
}

function cuerpo(campos: Record<string, Tipo>) {
  const propiedades: Record<string, unknown> = {};
  const requeridos: string[] = [];

  for (const [clave, tipo] of Object.entries(campos)) {
    const opcional = clave.endsWith("?");
    const nombre = opcional ? clave.slice(0, -1) : clave;
    propiedades[nombre] =
      tipo === "array"
        ? {
            type: "array",
            items: {
              type: "object",
              properties: { productoId: { type: "integer" }, cantidad: { type: "integer", minimum: 1 } }
            }
          }
        : { type: tipo, example: ejemplo[tipo] };

    if (!opcional) {
      requeridos.push(nombre);
    }
  }

  return {
    required: true,
    content: { "application/json": { schema: { type: "object", required: requeridos, properties: propiedades } } }
  };
}

const respuestaError = (descripcion: string) => ({
  description: descripcion,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
});

export function construirRutasDominio() {
  const rutas: Record<string, Record<string, unknown>> = {};

  for (const [metodo, ruta, tag, resumen, opciones = {}] of DEFINICIONES) {
    const respuestas: Record<string, unknown> = {
      [metodo === "post" ? "201" : "200"]: { description: opciones.exito ?? opciones.descripcion ?? "Operación correcta" },
      "401": respuestaError("Token requerido, inválido o vencido")
    };

    if (opciones.cuerpo || ruta.includes("{")) {
      respuestas["400"] = respuestaError("Datos inválidos");
    }

    if (opciones.admin) {
      respuestas["403"] = respuestaError("Requiere el tipo de empleado Administrador");
    }

    if (ruta.includes("{") && metodo !== "post") {
      respuestas["404"] = respuestaError("Registro no encontrado");
    }

    if (metodo !== "get") {
      respuestas["409"] = respuestaError("Regla de negocio incumplida (p. ej. stock insuficiente, duplicado, estado no editable)");
    }

    rutas[ruta] = {
      ...rutas[ruta],
      [metodo]: {
        tags: [tag],
        summary: resumen,
        security: ruta === "/api/salud" ? [] : [{ bearerAuth: [] }],
        parameters: parametros(ruta, opciones.consulta),
        ...(opciones.cuerpo ? { requestBody: cuerpo(opciones.cuerpo) } : {}),
        responses: respuestas
      }
    };
  }

  return rutas;
}

export const etiquetasDominio = [...new Set(DEFINICIONES.map((d) => d[2]))].map((name) => ({ name }));
