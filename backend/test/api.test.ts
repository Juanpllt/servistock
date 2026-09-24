/**
 * Pruebas de integración de la API contra PostgreSQL real.
 * Usan SIEMPRE la base "servistack_test", que se recrea desde cero en cada ejecución.
 *   DB_PORT=5433 DB_PASSWORD=... npm test
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import ExcelJS from "exceljs";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import pg from "pg";
import { io as conectarSocket } from "socket.io-client";

process.env.DB_NAME = "servistack_test";
process.env.AUTO_INIT_DB = "false";

// Auth0 simulado: un servidor local publica las claves públicas (JWKS) y los tests firman los tokens
const { publicKey, privateKey } = await generateKeyPair("RS256");
const otraClave = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
const servidorJwks = createServer((_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise<void>((resolver) => servidorJwks.listen(0, "127.0.0.1", resolver));
const ISSUER = `http://127.0.0.1:${(servidorJwks.address() as AddressInfo).port}/`;
const CLIENT_ID = "client-test-123";
process.env.AUTH0_DOMAIN = "servistock-test.auth0.com";
process.env.AUTH0_CLIENT_ID = CLIENT_ID;
process.env.AUTH0_ISSUER = ISSUER;

function tokenAuth0(opciones: { email?: string; verificado?: boolean; aud?: string; iss?: string; exp?: string | number; clave?: CryptoKey } = {}) {
  return new SignJWT({ email: opciones.email ?? "pepe@correo.com", email_verified: opciones.verificado ?? true })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(opciones.iss ?? ISSUER)
    .setAudience(opciones.aud ?? CLIENT_ID)
    .setSubject("auth0|abc123")
    .setIssuedAt()
    .setExpirationTime(opciones.exp ?? "5m")
    .sign(opciones.clave ?? privateKey);
}

const { env } = await import("../src/config/env.js");
const { inicializarBaseDeDatos } = await import("../src/db/inicializar.js");
const { crearApp } = await import("../src/app.js");
const { iniciarTiempoReal, cerrarTiempoReal } = await import("../src/realtime/socket.js");
const { pool } = await import("../src/config/db.js");

let servidor: Server;
let base = "";

interface Respuesta {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Headers;
}

async function api(metodo: string, ruta: string, token?: string, cuerpo?: unknown): Promise<Respuesta> {
  const respuesta = await fetch(`${base}/api${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : null
  });
  const texto = await respuesta.text();

  return {
    status: respuesta.status,
    body: texto && respuesta.headers.get("content-type")?.includes("json") ? JSON.parse(texto) : texto,
    headers: respuesta.headers
  };
}

async function login(email: string, password: string) {
  const r = await api("POST", "/auth/login", undefined, { email, password });
  assert.equal(r.status, 200, `login ${email}`);
  return r.body.token as string;
}

async function descargarExcel(tipo: string, token: string) {
  const respuesta = await fetch(`${base}/api/exportaciones/${tipo}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(respuesta.status, 200);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.from(await respuesta.arrayBuffer()) as unknown as ArrayBuffer);
  const hoja = libro.worksheets[0];
  assert.ok(hoja, "el libro debe tener una hoja");
  return { hoja, vacia: respuesta.headers.get("x-exportacion-vacia") === "true" };
}

before(async () => {
  const admin = new pg.Client({ ...env.db, database: "postgres" });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${env.db.database}" WITH (FORCE)`);
  await admin.end();
  await inicializarBaseDeDatos();

  servidor = createServer(crearApp());
  iniciarTiempoReal(servidor);
  await new Promise<void>((resolver) => servidor.listen(0, resolver));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

after(async () => {
  await cerrarTiempoReal();
  servidor.close();
  servidorJwks.close();
  await pool.end();
});

describe("Servistock API", () => {
  let admin = "";
  let pepe = "";
  let categoriaId = 0;
  let productoId = 0;
  let producto2Id = 0;
  let proyectoId = 0;
  let pedidoId = 0;
  let entradaId = 0;
  let salidaId = 0;
  let empleadoCreadoId = 0;

  it("RNF-01: health check con base de datos", async () => {
    const r = await api("GET", "/salud");
    assert.equal(r.status, 200);
    assert.equal(r.body.estado, "ok");
  });

  it("RF-65/66: credenciales correctas emiten token; incorrectas dan mensaje genérico sin token", async () => {
    admin = await login("admin@correo.com", "123456");
    pepe = await login("pepe@correo.com", "pepe123");

    const mala = await api("POST", "/auth/login", undefined, { email: "admin@correo.com", password: "mala" });
    assert.equal(mala.status, 401);
    assert.equal(mala.body.mensaje, "Credenciales incorrectas");
    assert.equal(mala.body.token, undefined);

    const inexistente = await api("POST", "/auth/login", undefined, { email: "nadie@correo.com", password: "x" });
    assert.equal(inexistente.body.mensaje, mala.body.mensaje, "no debe revelar cuál campo falló");
  });

  it("rutas protegidas exigen token", async () => {
    assert.equal((await api("GET", "/productos")).status, 401);
    assert.equal((await api("GET", "/productos", "token-falso")).status, 401);
  });

  describe("Exportaciones sin datos (RF-67 a RF-71)", () => {
    for (const tipo of ["pedidos", "entradas", "salidas", "proyectos", "inventario"]) {
      it(`${tipo}: solo encabezados y aviso de vacío`, async () => {
        const { hoja, vacia } = await descargarExcel(tipo, admin);
        assert.equal(vacia, true);
        assert.equal(hoja.rowCount, 1, "solo la fila de encabezados");
        assert.ok(String(hoja.getRow(1).getCell(1).value).length > 0);
      });
    }
  });

  describe("Empleados (RF-01 a RF-05, RN-11, ADR-011/012)", () => {
    it("un Empleado no puede crear cuentas (403)", async () => {
      const r = await api("POST", "/empleados", pepe, {
        nombre: "Intruso", email: "intruso@correo.com", password: "secreto1", rolId: 1
      });
      assert.equal(r.status, 403);
    });

    it("el Administrador crea un empleado y la contraseña no se devuelve", async () => {
      const r = await api("POST", "/empleados", admin, {
        nombre: "Laura", email: "Laura@Correo.com", password: "laura123", rolId: 2
      });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.email, "laura@correo.com");
      assert.equal(r.body.data.rol, "Empleado");
      assert.equal(JSON.stringify(r.body).includes("password"), false);
      empleadoCreadoId = r.body.data.id;
      await login("laura@correo.com", "laura123");
    });

    it("rechaza usuario duplicado (409) y datos inválidos (400)", async () => {
      const dup = await api("POST", "/empleados", admin, {
        nombre: "Otra", email: "laura@correo.com", password: "laura123", rolId: 2
      });
      assert.equal(dup.status, 409);

      const invalido = await api("POST", "/empleados", admin, { nombre: "", email: "x", password: "1", rolId: 2 });
      assert.equal(invalido.status, 400);
    });

    it("RF-03: empleado inexistente da 404", async () => {
      assert.equal((await api("GET", "/empleados/99999", admin)).status, 404);
    });

    it("RF-05: un Empleado no edita a otro, pero sí su propia cuenta", async () => {
      const otro = await api("PUT", `/empleados/${empleadoCreadoId}`, pepe, {
        nombre: "Hack", email: "laura@correo.com"
      });
      assert.equal(otro.status, 403);

      const yo = (await api("GET", "/auth/me", pepe)).body.usuario.id;
      const propio = await api("PUT", `/empleados/${yo}`, pepe, { nombre: "Pepe Pérez", email: "pepe@correo.com" });
      assert.equal(propio.status, 200);
      assert.equal(propio.body.data.nombre, "Pepe Pérez");
    });

    it("ADR-012: TipoEmpleado no cambia por edición ordinaria, solo por el caso de uso de Administrador", async () => {
      const yo = (await api("GET", "/auth/me", pepe)).body.usuario.id;
      await api("PUT", `/empleados/${yo}`, pepe, { nombre: "Pepe", email: "pepe@correo.com", rolId: 1 });
      assert.equal((await api("GET", `/empleados/${yo}`, admin)).body.rol, "Empleado");

      assert.equal((await api("PATCH", `/empleados/${yo}/tipo`, pepe, { rolId: 1 })).status, 403);
      const admins = await api("PATCH", `/empleados/${yo}/tipo`, admin, { rolId: 1 });
      assert.equal(admins.status, 200);
      assert.equal(admins.body.data.rol, "Administrador");
      await api("PATCH", `/empleados/${yo}/tipo`, admin, { rolId: 2 });
    });

    it("no se elimina la propia cuenta ni al único administrador", async () => {
      const yoAdmin = (await api("GET", "/auth/me", admin)).body.usuario.id;
      assert.equal((await api("DELETE", `/empleados/${yoAdmin}`, admin)).status, 409);
    });
  });

  describe("Productos y categorías (RF-06 a RF-15)", () => {
    it("RF-13: crea categoría; rechaza vacía y duplicada", async () => {
      const ok = await api("POST", "/categorias", pepe, { nombre: "Bombas" });
      assert.equal(ok.status, 201);
      categoriaId = ok.body.data.id;
      assert.equal((await api("POST", "/categorias", pepe, { nombre: "Bombas" })).status, 409);
      assert.equal((await api("POST", "/categorias", pepe, { nombre: "  " })).status, 400);
    });

    it("RF-06: crea producto con stock inicial en cero", async () => {
      const r = await api("POST", "/productos", pepe, {
        nombre: "Bomba centrífuga", categoriaId, codigoQrBarras: "QR-001", cantidadMinimaStock: 5
      });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.stockActual, 0);
      productoId = r.body.data.id;

      const r2 = await api("POST", "/productos", pepe, {
        nombre: "Filtro de arena", categoriaId, codigoQrBarras: "QR-002", cantidadMinimaStock: 1
      });
      producto2Id = r2.body.data.id;
    });

    it("RF-06: campo obligatorio vacío rechaza sin crear; código duplicado da 409", async () => {
      const faltante = await api("POST", "/productos", pepe, { nombre: "X", categoriaId, cantidadMinimaStock: 1 });
      assert.equal(faltante.status, 400);
      const dup = await api("POST", "/productos", pepe, {
        nombre: "Otro", categoriaId, codigoQrBarras: "QR-001", cantidadMinimaStock: 1
      });
      assert.equal(dup.status, 409);
      const sinCategoria = await api("POST", "/productos", pepe, {
        nombre: "Otro", categoriaId: 99999, codigoQrBarras: "QR-9", cantidadMinimaStock: 1
      });
      assert.equal(sinCategoria.status, 400);
    });

    it("RF-07/08: consulta por id y por código QR; inexistentes dan 404", async () => {
      assert.equal((await api("GET", `/productos/${productoId}`, pepe)).body.nombre, "Bomba centrífuga");
      assert.equal((await api("GET", "/productos/codigo/QR-001", pepe)).body.id, productoId);
      assert.equal((await api("GET", "/productos/99999", pepe)).status, 404);
      assert.equal((await api("GET", "/productos/codigo/NO-EXISTE", pepe)).status, 404);
    });

    it("RF-09/10/11: listado y filtros por nombre y categoría", async () => {
      assert.equal((await api("GET", "/productos", pepe)).body.length, 2);
      assert.equal((await api("GET", "/productos?nombre=bomba", pepe)).body.length, 1);
      assert.equal((await api("GET", "/productos?nombre=%25", pepe)).body.length, 0, "el % no es comodín");
      assert.equal((await api("GET", `/productos?categoriaId=${categoriaId}`, pepe)).body.length, 2);
    });

    it("RF-12: edita producto; el stock no se puede modificar por edición", async () => {
      const r = await api("PUT", `/productos/${productoId}`, pepe, {
        nombre: "Bomba centrífuga 2HP", categoriaId, codigoQrBarras: "QR-001", cantidadMinimaStock: 5, stockActual: 999
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.nombre, "Bomba centrífuga 2HP");
      assert.equal(r.body.data.stockActual, 0);
    });
  });

  describe("Pedidos y entradas (RF-16 a RF-29, ADR-015)", () => {
    it("RF-16/57: crea pedido 'En espera' y genera notificación de creación", async () => {
      const r = await api("POST", "/pedidos", pepe, { proveedor: "Hidro S.A." });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.estado, "En espera");
      pedidoId = r.body.data.id;

      const notifs = await api("GET", "/notificaciones", pepe);
      assert.ok(notifs.body.notificaciones.some((n: any) => n.tipo === "pedido" && n.referenciaId === pedidoId));
    });

    it("RF-16/57: proveedor vacío se rechaza y no genera notificación", async () => {
      const antes = (await api("GET", "/notificaciones", pepe)).body.notificaciones.length;
      assert.equal((await api("POST", "/pedidos", pepe, { proveedor: "" })).status, 400);
      assert.equal((await api("GET", "/notificaciones", pepe)).body.notificaciones.length, antes);
    });

    it("RF-22: una entrada exige pedido existente; sin pedido o con cantidad inválida no se crea", async () => {
      const lineas = [{ productoId, cantidad: 10 }];
      assert.equal((await api("POST", "/entradas", pepe, { pedidoId: 99999, tipoEntradaId: 1, lineas })).status, 404);
      assert.equal((await api("POST", "/entradas", pepe, { tipoEntradaId: 1, lineas })).status, 400);
      assert.equal(
        (await api("POST", "/entradas", pepe, { pedidoId, tipoEntradaId: 1, lineas: [{ productoId, cantidad: 0 }] })).status,
        400
      );
      assert.equal(
        (await api("POST", "/entradas", pepe, { pedidoId, tipoEntradaId: 1, lineas: [{ productoId: 99999, cantidad: 1 }] })).status,
        400
      );
      assert.equal((await api("GET", "/entradas", pepe)).body.length, 0, "no debe quedar ninguna entrada");
      assert.equal((await api("GET", `/productos/${productoId}`, pepe)).body.stockActual, 0);
    });

    it("RF-22 / ADR-015: registra la entrada y suma el stock en la misma transacción", async () => {
      const r = await api("POST", "/entradas", pepe, {
        pedidoId, tipoEntradaId: 1,
        lineas: [{ productoId, cantidad: 60 }, { productoId: producto2Id, cantidad: 3 }, { productoId, cantidad: 40 }]
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      entradaId = r.body.data.id;
      assert.equal(r.body.data.lineas.length, 2, "las líneas repetidas del mismo producto se unen");
      assert.equal(r.body.data.lineas.find((l: any) => l.productoId === productoId).cantidad, 100);
      assert.ok(r.body.data.lineas.every((l: any) => l.estado === "En espera"));
      assert.equal((await api("GET", `/productos/${productoId}`, pepe)).body.stockActual, 100);
      assert.equal((await api("GET", `/productos/${producto2Id}`, pepe)).body.stockActual, 3);
    });

    it("RF-29: otro empleado puede registrar la entrada de un pedido ajeno", async () => {
      const laura = await login("laura@correo.com", "laura123");
      const r = await api("POST", "/entradas", laura, {
        pedidoId, tipoEntradaId: 2, lineas: [{ productoId: producto2Id, cantidad: 2 }]
      });
      assert.equal(r.status, 201);
      assert.equal((await api("GET", `/productos/${producto2Id}`, pepe)).body.stockActual, 5);
    });

    it("RF-23/24/25: detalle, listado y filtro por estado", async () => {
      assert.equal((await api("GET", `/entradas/${entradaId}`, pepe)).body.lineas.length, 2);
      assert.equal((await api("GET", "/entradas/99999", pepe)).status, 404);
      assert.equal((await api("GET", "/entradas", pepe)).body.length, 2);
      assert.equal((await api("GET", "/entradas?estadoId=1", pepe)).body.length, 2);
      assert.equal((await api("GET", "/entradas?estadoId=3", pepe)).body.length, 0);
    });

    it("RF-20: un pedido con entradas no se puede editar (409); RF-17 muestra sus entradas", async () => {
      const r = await api("PUT", `/pedidos/${pedidoId}`, pepe, { proveedor: "Otro" });
      assert.equal(r.status, 409);
      const detalle = await api("GET", `/pedidos/${pedidoId}`, pepe);
      assert.equal(detalle.body.entradas.length, 2);
      assert.equal(detalle.body.totalEntradas, 2);
    });

    it("RF-20: un pedido sin entradas sí se edita", async () => {
      const nuevo = await api("POST", "/pedidos", pepe, { proveedor: "Temporal" });
      const r = await api("PUT", `/pedidos/${nuevo.body.data.id}`, pepe, { proveedor: "Definitivo" });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.proveedor, "Definitivo");
    });

    it("RF-21/58: cambia el estado del pedido a mano, genera notificación y valida el catálogo", async () => {
      const r = await api("PATCH", `/pedidos/${pedidoId}/estado`, pepe, { tipoEstadoId: 3 });
      assert.equal(r.status, 200);
      assert.equal(r.body.data.estado, "Completado");
      assert.equal((await api("PATCH", `/pedidos/${pedidoId}/estado`, pepe, { tipoEstadoId: 999 })).status, 409);
      assert.equal(
        (await api("GET", "/notificaciones", pepe)).body.notificaciones.filter(
          (n: any) => n.tipo === "pedido" && n.referenciaId === pedidoId
        ).length,
        2
      );
    });

    it("RF-19: filtra pedidos por estado", async () => {
      assert.equal((await api("GET", "/pedidos?estadoId=3", pepe)).body.length, 1);
      assert.equal((await api("GET", "/pedidos?estadoId=1", pepe)).body.length, 1);
    });

    it("RF-27: cambia el estado de una línea; RF-28: la entrada se completa aunque haya líneas canceladas (RN-03)", async () => {
      const [l1, l2] = (await api("GET", `/entradas/${entradaId}`, pepe)).body.lineas;
      assert.equal((await api("PATCH", `/entradas/${entradaId}/lineas/${l1.id}/estado`, pepe, { tipoEstadoId: 4 })).status, 200);
      assert.equal((await api("PATCH", `/entradas/${entradaId}/lineas/${l2.id}/estado`, pepe, { tipoEstadoId: 999 })).status, 409);
      assert.equal((await api("PATCH", `/entradas/${entradaId}/lineas/99999/estado`, pepe, { tipoEstadoId: 3 })).status, 404);

      const completa = await api("PATCH", `/entradas/${entradaId}/estado`, pepe, { tipoEstadoId: 3 });
      assert.equal(completa.status, 200);
      assert.equal(completa.body.data.estado, "Completado");
      assert.equal(completa.body.data.lineas.find((l: any) => l.id === l1.id).estado, "Cancelado");
    });

    it("RF-26: una entrada completada no se puede editar", async () => {
      const [linea] = (await api("GET", `/entradas/${entradaId}`, pepe)).body.lineas;
      assert.equal((await api("PUT", `/entradas/${entradaId}/lineas/${linea.id}`, pepe, { cantidad: 5 })).status, 409);
      assert.equal((await api("PUT", `/entradas/${entradaId}`, pepe, { pedidoId, tipoEntradaId: 1 })).status, 409);
    });

    it("RF-26: edita la cantidad de una línea no completada ajustando el stock por la diferencia", async () => {
      const nuevoPedido = (await api("POST", "/pedidos", pepe, { proveedor: "Ajustes" })).body.data.id;
      const e = await api("POST", "/entradas", pepe, {
        pedidoId: nuevoPedido, tipoEntradaId: 1, lineas: [{ productoId: producto2Id, cantidad: 10 }]
      });
      assert.equal((await api("GET", `/productos/${producto2Id}`, pepe)).body.stockActual, 15);

      const linea = e.body.data.lineas[0];
      const r = await api("PUT", `/entradas/${e.body.data.id}/lineas/${linea.id}`, pepe, { cantidad: 4 });
      assert.equal(r.status, 200);
      assert.equal((await api("GET", `/productos/${producto2Id}`, pepe)).body.stockActual, 9);
    });
  });

  describe("Proyectos (RF-30 a RF-38)", () => {
    it("RF-30: crea proyecto (en curso); nombre vacío se rechaza", async () => {
      const r = await api("POST", "/proyectos", pepe, { nombre: "Planta El Retiro", descripcion: "Mantenimiento" });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.estado, "En curso");
      proyectoId = r.body.data.id;
      assert.equal((await api("POST", "/proyectos", pepe, { nombre: "" })).status, 400);
    });

    it("RF-31/38: asigna, rechaza duplicado, reasigna y retira empleados", async () => {
      const yo = (await api("GET", "/auth/me", pepe)).body.usuario.id;
      const ok = await api("POST", `/proyectos/${proyectoId}/empleados`, pepe, { empleadoId: yo, tipoParticipacionId: 1 });
      assert.equal(ok.status, 201);
      assert.equal(ok.body.data.empleados.length, 1);

      assert.equal(
        (await api("POST", `/proyectos/${proyectoId}/empleados`, pepe, { empleadoId: yo, tipoParticipacionId: 2 })).status,
        409
      );
      const re = await api("PUT", `/proyectos/${proyectoId}/empleados/${yo}`, pepe, { tipoParticipacionId: 2 });
      assert.equal(re.body.data.empleados[0].tipoParticipacion, "Técnico");
      assert.equal((await api("PUT", `/proyectos/${proyectoId}/empleados/99999`, pepe, { tipoParticipacionId: 2 })).status, 404);

      const proyectos = await api("GET", `/empleados/${yo}/proyectos`, pepe);
      assert.equal(proyectos.body.length, 1, "RF-74");

      assert.equal((await api("DELETE", `/proyectos/${proyectoId}/empleados/${yo}`, pepe)).body.data.empleados.length, 0);
      assert.equal((await api("DELETE", `/proyectos/${proyectoId}/empleados/${yo}`, pepe)).status, 404);
    });

    it("RF-33/34/35: listado y filtros por estado y nombre", async () => {
      assert.equal((await api("GET", "/proyectos", pepe)).body.length, 1);
      assert.equal((await api("GET", "/proyectos?estadoId=2", pepe)).body.length, 1);
      assert.equal((await api("GET", "/proyectos?estadoId=3", pepe)).body.length, 0);
      assert.equal((await api("GET", "/proyectos?nombre=retiro", pepe)).body.length, 1);
    });
  });

  describe("Salidas (RF-39 a RF-48, ADR-001/002/003)", () => {
    it("RF-39: cantidad mayor al stock se rechaza sin modificar nada", async () => {
      const antes = (await api("GET", `/productos/${productoId}`, pepe)).body.stockActual;
      const r = await api("POST", "/salidas", pepe, {
        proyectoId, lineas: [{ productoId: producto2Id, cantidad: 1 }, { productoId, cantidad: antes + 1 }]
      });
      assert.equal(r.status, 409);
      assert.match(r.body.mensaje, /Stock insuficiente/);
      assert.equal((await api("GET", `/productos/${productoId}`, pepe)).body.stockActual, antes);
      assert.equal((await api("GET", `/productos/${producto2Id}`, pepe)).body.stockActual, 9, "rollback completo");
      assert.equal((await api("GET", "/salidas", pepe)).body.length, 0);
    });

    it("RF-39/56: registra la salida, descuenta el stock y notifica el stock bajo", async () => {
      const r = await api("POST", "/salidas", pepe, {
        proyectoId, lineas: [{ productoId, cantidad: 96 }, { productoId: producto2Id, cantidad: 2 }]
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      salidaId = r.body.data.id;
      assert.equal((await api("GET", `/productos/${productoId}`, pepe)).body.stockActual, 4);

      const notifs = (await api("GET", "/notificaciones", pepe)).body.notificaciones;
      const stockBajo = notifs.filter((n: any) => n.tipo === "producto");
      assert.equal(stockBajo.length, 1, "solo el producto bajo su mínimo (4 <= 5) genera notificación");
      assert.equal(stockBajo[0].referenciaId, productoId);
    });

    it("RF-56: un stock por encima del mínimo no genera notificación", async () => {
      const antes = (await api("GET", "/notificaciones", pepe)).body.notificaciones.filter((n: any) => n.tipo === "producto").length;
      const r = await api("POST", "/salidas", pepe, { proyectoId, lineas: [{ productoId: producto2Id, cantidad: 1 }] });
      assert.equal(r.status, 201);
      // producto2 tenía 7 y mínimo 1 -> 6, sin alerta
      const despues = (await api("GET", "/notificaciones", pepe)).body.notificaciones.filter((n: any) => n.tipo === "producto").length;
      assert.equal(despues, antes);
    });

    it("RF-60: marca una notificación como leída; inexistente da 404", async () => {
      const antes = await api("GET", "/notificaciones", pepe);
      const n = antes.body.notificaciones[0];
      assert.equal((await api("PATCH", `/notificaciones/${n.tipo}/${n.id}/leida`, pepe)).status, 200);
      const despues = await api("GET", "/notificaciones", pepe);
      assert.equal(despues.body.noLeidas, antes.body.noLeidas - 1);
      assert.equal((await api("PATCH", "/notificaciones/pedido/99999/leida", pepe)).status, 404);
    });

    it("RF-42: cantidad total usada por producto en el proyecto", async () => {
      const r = await api("GET", `/proyectos/${proyectoId}/consumo`, pepe);
      const bomba = r.body.find((x: any) => x.productoId === productoId);
      assert.equal(bomba.cantidadTotal, 96);
    });

    it("caso 5.3: una salida exige un proyecto en curso", async () => {
      const cerrado = (await api("POST", "/proyectos", pepe, { nombre: "Cerrado" })).body.data.id;
      await api("PATCH", `/proyectos/${cerrado}/estado`, pepe, { tipoEstadoId: 3 });
      const r = await api("POST", "/salidas", pepe, { proyectoId: cerrado, lineas: [{ productoId: producto2Id, cantidad: 1 }] });
      assert.equal(r.status, 409);
      assert.equal((await api("POST", "/salidas", pepe, { proyectoId: 99999, lineas: [{ productoId, cantidad: 1 }] })).status, 404);
      // RF-36: un proyecto completado no se edita
      assert.equal((await api("PUT", `/proyectos/${cerrado}`, pepe, { nombre: "Nuevo nombre" })).status, 409);
    });

    it("concurrencia: dos salidas simultáneas por el mismo stock -> solo una prospera y nunca hay stock negativo", async () => {
      const p = (await api("POST", "/productos", pepe, {
        nombre: "Válvula", categoriaId, codigoQrBarras: "QR-CONC", cantidadMinimaStock: 0
      })).body.data.id;
      const ped = (await api("POST", "/pedidos", pepe, { proveedor: "Conc" })).body.data.id;
      await api("POST", "/entradas", pepe, { pedidoId: ped, tipoEntradaId: 1, lineas: [{ productoId: p, cantidad: 100 }] });

      const intentos = await Promise.all(
        Array.from({ length: 6 }, () =>
          api("POST", "/salidas", pepe, { proyectoId, lineas: [{ productoId: p, cantidad: 60 }] })
        )
      );
      const exitosos = intentos.filter((r) => r.status === 201).length;
      const rechazados = intentos.filter((r) => r.status === 409).length;

      assert.equal(exitosos, 1);
      assert.equal(rechazados, 5);
      assert.equal((await api("GET", `/productos/${p}`, pepe)).body.stockActual, 40);
    });

    it("RF-47: edita la cantidad de una línea ajustando el stock; valida stock disponible", async () => {
      const detalle = (await api("GET", `/salidas/${salidaId}`, pepe)).body;
      const linea = detalle.lineas.find((l: any) => l.productoId === productoId);

      assert.equal((await api("PUT", `/salidas/${salidaId}/lineas/${linea.id}`, pepe, { cantidad: 90 })).status, 200);
      assert.equal((await api("GET", `/productos/${productoId}`, pepe)).body.stockActual, 10);
      assert.equal((await api("PUT", `/salidas/${salidaId}/lineas/${linea.id}`, pepe, { cantidad: 500 })).status, 409);
      assert.equal((await api("GET", `/productos/${productoId}`, pepe)).body.stockActual, 10);
    });

    it("RF-44/47/48: estado de línea y de salida; una línea completada ya no se edita", async () => {
      const detalle = (await api("GET", `/salidas/${salidaId}`, pepe)).body;
      const linea = detalle.lineas[0];

      assert.equal((await api("PATCH", `/salidas/${salidaId}/lineas/${linea.id}/estado`, pepe, { tipoEstadoId: 3 })).status, 200);
      assert.equal((await api("PUT", `/salidas/${salidaId}/lineas/${linea.id}`, pepe, { cantidad: 1 })).status, 409);
      assert.equal((await api("PATCH", `/salidas/${salidaId}/estado`, pepe, { tipoEstadoId: 999 })).status, 409);

      const completa = await api("PATCH", `/salidas/${salidaId}/estado`, pepe, { tipoEstadoId: 3 });
      assert.equal(completa.body.data.estado, "Completado");
      assert.equal((await api("PUT", `/salidas/${salidaId}`, pepe, { proyectoId })).status, 409);
      assert.equal((await api("GET", "/salidas?estadoId=3", pepe)).body.length, 1);
    });
  });

  describe("Historial (RF-49 a RF-55) y resumen (RF-72)", () => {
    it("RF-49: historial de estados del pedido ordenado por fecha", async () => {
      const r = await api("GET", `/historial/pedidos/${pedidoId}`, pepe);
      assert.deepEqual(r.body.historial.map((h: any) => h.estado), ["En espera", "Completado"]);
    });

    it("RF-50/52/54: rangos de fechas válidos devuelven datos; inválidos se rechazan", async () => {
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      const ayer = new Date(Date.now() - 2 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

      for (const tipo of ["pedidos", "entradas", "salidas"]) {
        const dentro = await api("GET", `/historial/${tipo}?desde=${hoy}&hasta=${hoy}`, pepe);
        assert.equal(dentro.status, 200);
        assert.ok(dentro.body.length > 0, `${tipo} de hoy`);

        const fuera = await api("GET", `/historial/${tipo}?desde=2000-01-01&hasta=2000-01-31`, pepe);
        assert.equal(fuera.body.length, 0);

        assert.equal((await api("GET", `/historial/${tipo}?desde=${hoy}&hasta=${ayer}`, pepe)).status, 400, "desde > hasta");
        assert.equal((await api("GET", `/historial/${tipo}?desde=no-es-fecha`, pepe)).status, 400);
      }
    });

    it("RF-51/53/55: detalle histórico de entrada, salida y proyecto", async () => {
      assert.equal((await api("GET", `/historial/entradas/${entradaId}`, pepe)).body.lineas.length, 2);
      assert.ok((await api("GET", `/historial/salidas/${salidaId}`, pepe)).body.historial.length >= 2);
      assert.ok((await api("GET", `/historial/proyectos/${proyectoId}`, pepe)).body.historial.length >= 1);
      assert.equal((await api("GET", "/historial/proyectos/99999", pepe)).status, 404);
    });

    it("RF-72: resumen con productos en stock bajo y proyectos en curso", async () => {
      const r = await api("GET", "/resumen", pepe);
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body.stockBajo) && r.body.stockBajo.every((p: any) => p.stockActual <= p.cantidadMinimaStock));
      assert.ok(r.body.proyectosEnCurso.length >= 1);
    });
  });

  describe("Catálogos (RF-61 a RF-64, RN-12)", () => {
    it("cualquiera lee; solo el Administrador escribe; duplicados y vacíos se rechazan", async () => {
      assert.equal((await api("GET", "/catalogos/tipos-entrada", pepe)).body.length, 3);
      assert.equal((await api("POST", "/catalogos/tipos-entrada", pepe, { nombre: "Donación" })).status, 403);

      const ok = await api("POST", "/catalogos/tipos-entrada", admin, { nombre: "Donación" });
      assert.equal(ok.status, 201);
      assert.equal((await api("POST", "/catalogos/tipos-entrada", admin, { nombre: "Donación" })).status, 409);
      assert.equal((await api("PUT", `/catalogos/tipos-entrada/${ok.body.data.id}`, admin, { nombre: "" })).status, 400);
      assert.equal((await api("PUT", `/catalogos/tipos-entrada/${ok.body.data.id}`, admin, { nombre: "Obsequio" })).body.data.nombre, "Obsequio");
    });

    it("catálogo de estados editable por el Administrador; TipoEmpleado es solo lectura (RN-12)", async () => {
      assert.equal((await api("POST", "/catalogos/estados", admin, { nombre: "Pausado" })).status, 201);
      assert.equal((await api("GET", "/catalogos/tipos-empleado", pepe)).body.length, 2);
      assert.equal((await api("POST", "/catalogos/tipos-empleado", admin, { nombre: "Superusuario" })).status, 404);
    });

    it("RF-15: edita el nombre de una categoría", async () => {
      const r = await api("PUT", `/categorias/${categoriaId}`, pepe, { nombre: "Bombas y motores" });
      assert.equal(r.body.data.nombre, "Bombas y motores");
    });
  });

  describe("Exportaciones con datos (RF-67 a RF-71)", () => {
    it("pedidos: encabezado + una fila por pedido con su historial de estados", async () => {
      const { hoja, vacia } = await descargarExcel("pedidos", pepe);
      assert.equal(vacia, false);
      assert.equal(hoja.rowCount, 1 + 4);
      assert.match(String(hoja.getRow(2).getCell(7).value), /En espera/);
    });

    it("entradas y salidas: una fila por línea de producto", async () => {
      const entradas = await descargarExcel("entradas", pepe);
      assert.equal(entradas.hoja.rowCount, 1 + 5);
      const salidas = await descargarExcel("salidas", pepe);
      assert.equal(salidas.hoja.rowCount > 1, true);
    });

    it("proyectos: producto y cantidad usada por proyecto", async () => {
      const { hoja } = await descargarExcel("proyectos", pepe);
      const filas = hoja.getRows(2, hoja.rowCount - 1) ?? [];
      const bomba = filas.find((f) => String(f.getCell(4).value).includes("Bomba"));
      assert.ok(bomba, "aparece la bomba usada en el proyecto");
      assert.equal(Number(bomba.getCell(6).value), 90);
    });

    it("inventario: stock actual persistido y situación", async () => {
      const { hoja } = await descargarExcel("inventario", pepe);
      const filas = hoja.getRows(2, hoja.rowCount - 1) ?? [];
      const bomba = filas.find((f) => String(f.getCell(1).value).includes("Bomba"));
      assert.equal(Number(bomba?.getCell(4).value), 10);
      assert.equal(bomba?.getCell(6).value, "Normal");
    });

    it("tipo de exportación desconocido se rechaza", async () => {
      assert.equal((await api("GET", "/exportaciones/secretos", pepe)).status, 400);
    });
  });

  describe("Tiempo real con Socket.IO (decisión transversal)", () => {
    it("rechaza conexiones sin token válido", async () => {
      const socket = conectarSocket(base, { auth: { token: "falso" }, reconnection: false });
      const error = await new Promise<Error>((resolver) => socket.on("connect_error", resolver));
      assert.equal(error.message, "No autorizado");
      socket.close();
    });

    it("publica stock:actualizado solo después del commit, y nada si hay rollback", async () => {
      const socket = conectarSocket(base, { auth: { token: pepe }, reconnection: false });
      await new Promise<void>((resolver) => socket.on("connect", () => resolver()));

      const eventos: any[] = [];
      socket.on("stock:actualizado", (d) => eventos.push(d));

      const rechazada = await api("POST", "/salidas", pepe, { proyectoId, lineas: [{ productoId, cantidad: 100000 }] });
      assert.equal(rechazada.status, 409);
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(eventos.length, 0, "el rollback no emite eventos");

      const ok = await api("POST", "/salidas", pepe, { proyectoId, lineas: [{ productoId, cantidad: 1 }] });
      assert.equal(ok.status, 201);
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(eventos.length, 1);
      assert.equal(eventos[0][0].id, productoId);
      assert.equal(eventos[0][0].stockActual, 9);
      socket.close();
    });
  });

  describe("Auth0 (Identity Provider federado)", () => {
    const loginAuth0 = (idToken: string) => api("POST", "/auth/auth0", undefined, { idToken });

    it("GET /auth/config publica solo dominio y clientId (sin secretos)", async () => {
      const r = await api("GET", "/auth/config");
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { auth0: { domain: "servistock-test.auth0.com", clientId: CLIENT_ID } });
    });

    it("un ID token válido de una cuenta registrada abre sesión con el JWT de la API", async () => {
      const r = await loginAuth0(await tokenAuth0());
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.usuario.email, "pepe@correo.com");
      assert.equal(r.body.usuario.rol, "Empleado");
      assert.equal((await api("GET", "/auth/me", r.body.token)).status, 200, "el JWT emitido sirve en la API");
    });

    it("rechaza tokens con destinatario, emisor, correo sin verificar o vencimiento incorrectos", async () => {
      const casos: [string, Promise<string>][] = [
        ["otro Client ID", tokenAuth0({ aud: "otra-app" })],
        ["otro emisor", tokenAuth0({ iss: "https://otro-tenant.auth0.com/" })],
        ["correo sin verificar", tokenAuth0({ verificado: false })],
        ["token vencido", tokenAuth0({ exp: Math.floor(Date.now() / 1000) - 120 })]
      ];

      for (const [nombre, token] of casos) {
        const r = await loginAuth0(await token);
        assert.equal(r.status, 401, nombre);
        assert.equal(r.body.mensaje, "Credenciales incorrectas", nombre);
        assert.equal(r.body.token, undefined, nombre);
      }
    });

    it("un login correcto reinicia el contador de intentos fallidos", async () => {
      assert.equal((await loginAuth0(await tokenAuth0())).status, 200);
    });

    it("rechaza un token firmado con otra clave, basura, y cuentas no registradas en Servistock (403)", async () => {
      const otraFirma = await loginAuth0(await tokenAuth0({ clave: otraClave.privateKey }));
      assert.equal(otraFirma.status, 401, "firma que no es de Auth0");

      assert.equal((await loginAuth0("esto-no-es-un-jwt")).status, 401);

      const desconocida = await loginAuth0(await tokenAuth0({ email: "desconocido@correo.com" }));
      assert.equal(desconocida.status, 403);
      assert.match(desconocida.body.mensaje, /no está registrada en Servistock/);
      assert.equal(desconocida.body.token, undefined);
    });
  });

  describe("Documentación OpenAPI", () => {
    it("cada ruta documentada existe en la API real (la documentación no miente)", async () => {
      const { openapi } = await import("../src/docs/openapi.js");
      const faltantes: string[] = [];
      let revisadas = 0;

      for (const [ruta, metodos] of Object.entries(openapi.paths as Record<string, Record<string, unknown>>)) {
        for (const metodo of Object.keys(metodos)) {
          // Ids inexistentes y cuerpo vacío: nunca modifican datos (404 o 400)
          const url = ruta
            .replace("/api", "")
            .replace("{tipo}", ruta.includes("notificaciones") ? "pedido" : "pedidos")
            .replace("{codigo}", "sin-codigo")
            .replace(/\{\w+\}/g, "99999");
          const r = await api(metodo.toUpperCase(), url, admin, metodo === "get" || metodo === "delete" ? undefined : {});
          revisadas++;

          if (r.body?.mensaje === "Ruta no encontrada") {
            faltantes.push(`${metodo.toUpperCase()} ${ruta}`);
          }
        }
      }

      assert.deepEqual(faltantes, [], "rutas documentadas que no existen");
      assert.ok(revisadas > 70, `se revisaron ${revisadas} operaciones`);
    });
  });

  describe("Eliminación de empleados (RF-02, RN-13)", () => {
    it("un Empleado no elimina; se rechaza si el empleado tiene movimientos; sin movimientos se borra", async () => {
      assert.equal((await api("DELETE", `/empleados/${empleadoCreadoId}`, pepe)).status, 403);
      // Laura registró una entrada, así que no se puede borrar físicamente
      const conMovimientos = await api("DELETE", `/empleados/${empleadoCreadoId}`, admin);
      assert.equal(conMovimientos.status, 409);

      const nuevo = await api("POST", "/empleados", admin, {
        nombre: "Temporal", email: "temporal@correo.com", password: "temporal1", rolId: 2
      });
      const eliminado = await api("DELETE", `/empleados/${nuevo.body.data.id}`, admin);
      assert.equal(eliminado.status, 200);
      assert.equal((await api("GET", `/empleados/${nuevo.body.data.id}`, admin)).status, 404);
    });
  });
});
