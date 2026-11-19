import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { resolveProfileFromToken } from './auth.ts';

interface ConnectedClient {
  ws: WebSocket;
  profileId: number | null;
  roleName: string;
}

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ConnectedClient>();

  attach(server: HttpServer) {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', async (ws, req) => {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const token = url.searchParams.get('token') || '';
      const profile = token ? await resolveProfileFromToken(token) : null;

      const client: ConnectedClient = {
        ws,
        profileId: profile?.id ?? null,
        roleName: profile?.roleName ?? 'guest',
      };
      this.clients.add(client);

      ws.send(
        JSON.stringify({
          type: 'connection:ready',
          authenticated: Boolean(profile),
          roleName: client.roleName,
        })
      );

      ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string; token?: string };
          if (msg.type === 'auth' && msg.token) {
            const updatedProfile = await resolveProfileFromToken(msg.token);
            if (updatedProfile) {
              client.profileId = updatedProfile.id;
              client.roleName = updatedProfile.roleName;
              ws.send(
                JSON.stringify({
                  type: 'auth:confirmed',
                  roleName: client.roleName,
                })
              );
            }
          }
        } catch {
          // Ignore malformed client frames
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
      });
    });
  }

  broadcastToStaff(event: string, payload: unknown) {
    const serialized = JSON.stringify({ type: event, payload, timestamp: Date.now() });
    for (const client of this.clients) {
      if (
        client.ws.readyState === WebSocket.OPEN &&
        (client.roleName === 'staff' || client.roleName === 'admin')
      ) {
        client.ws.send(serialized);
      }
    }
  }

  sendToProfile(profileId: number, event: string, payload: unknown) {
    const serialized = JSON.stringify({ type: event, payload, timestamp: Date.now() });
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN && client.profileId === profileId) {
        client.ws.send(serialized);
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();
