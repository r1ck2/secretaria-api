import { Session } from "./session.entity";
import { User } from "@/modules/user/user.entity";
import { generateToken } from "@/utils/jwt";
import { SessionRepository } from "./session.repository";

export class SessionService {
  private sessionRepository: SessionRepository;

  constructor() {
    this.sessionRepository = new SessionRepository();
  }

  async createSession(user: User, ipAddress: string, userAgent: string): Promise<Session> {
    const token = generateToken(user);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return this.sessionRepository.create({
      user_id: user.id,
      token,
      ip_address: ipAddress,
      user_agent: userAgent,
      expires_at: expiresAt,
    });
  }

  async validateSession(token: string): Promise<Session | null> {
    try {
      const session = await this.sessionRepository.findOneByToken(token);
      if (!session) return null;
      await this.sessionRepository.updateLastActivity(session.id);
      return session;
    } catch {
      return null;
    }
  }

  async invalidateSession(token: string): Promise<void> {
    await this.sessionRepository.invalidateByToken(token);
  }
}
