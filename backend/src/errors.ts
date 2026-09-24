/** Error de negocio con código HTTP; el manejador global lo convierte en respuesta JSON. */
export class AppError extends Error {
  readonly status: number;

  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

export const noEncontrado = (que: string) => new AppError(404, `${que} no encontrado`);
export const conflicto = (mensaje: string) => new AppError(409, mensaje);
export const solicitudInvalida = (mensaje: string) => new AppError(400, mensaje);
