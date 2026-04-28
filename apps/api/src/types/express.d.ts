import type { Player } from "../services/security";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        player: Player;
        sessionId: string;
        tokenHash: string;
      };
    }
  }
}
