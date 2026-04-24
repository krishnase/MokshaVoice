import { io, type Socket } from 'socket.io-client';
import { authStorage } from './storage';
import type {
  SocketClientToServerEvents,
  SocketServerToClientEvents,
} from '@mokshavoice/shared-types';

const BASE_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';

let _socket: Socket<SocketServerToClientEvents, SocketClientToServerEvents> | null = null;

export function getSocket(): Socket<SocketServerToClientEvents, SocketClientToServerEvents> {
  if (_socket) return _socket;

  const token = authStorage.getString('accessToken');
  _socket = io(BASE_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: false,
  });

  return _socket;
}

export function connectSocket(): void {
  getSocket().connect();
}

export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
