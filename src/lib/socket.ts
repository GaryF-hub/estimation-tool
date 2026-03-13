import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL || undefined, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 60000,
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Ping the server health endpoint to wake it from Render free-tier sleep.
 * Resolves to true when the server is responsive, false on failure.
 */
export async function warmUpServer(): Promise<boolean> {
  try {
    const healthUrl = SOCKET_URL ? `${SOCKET_URL}/health` : "/health";
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(60000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
