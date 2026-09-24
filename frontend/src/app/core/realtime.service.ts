import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { io, type Socket } from 'socket.io-client';

export interface StockActualizado {
  id: number;
  nombre: string;
  stockActual: number;
  cantidadMinimaStock: number;
}

export interface NotificacionEvento {
  tipo: 'producto' | 'pedido';
  id: number;
  referenciaId: number;
  mensaje: string;
}

export interface MovimientoEvento {
  tipo: 'pedido' | 'entrada' | 'salida' | 'proyecto';
  id: number;
}

/**
 * Canal reactivo: el backend publica por Socket.IO solo después del COMMIT y aquí se expone como
 * flujos RxJS a los que se suscriben los componentes, sin recargar la pantalla.
 */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private socket: Socket | null = null;

  readonly conectado = signal(false);
  readonly stock$ = new Subject<StockActualizado[]>();
  readonly notificacion$ = new Subject<NotificacionEvento>();
  readonly movimiento$ = new Subject<MovimientoEvento>();

  conectar(token: string) {
    if (this.socket) {
      return;
    }

    this.socket = io({ auth: { token }, reconnectionDelayMax: 10000 });
    this.socket.on('connect', () => this.conectado.set(true));
    this.socket.on('disconnect', () => this.conectado.set(false));
    this.socket.on('stock:actualizado', (datos: StockActualizado[]) => this.stock$.next(datos));
    this.socket.on('notificacion:nueva', (datos: NotificacionEvento) => this.notificacion$.next(datos));
    this.socket.on('movimiento:registrado', (datos: MovimientoEvento) => this.movimiento$.next(datos));
  }

  desconectar() {
    this.socket?.close();
    this.socket = null;
    this.conectado.set(false);
  }
}
