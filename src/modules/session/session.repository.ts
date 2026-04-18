import { Session } from "./session.entity";

export class SessionRepository {
  async create(data: Partial<Session>): Promise<Session> {
    return Session.create(data as any);
  }

  async findOneByToken(token: string): Promise<Session | null> {
    return Session.findOne({ where: { token } });
  }

  async updateLastActivity(id: string): Promise<void> {
    await Session.update({ last_activity_at: new Date() }, { where: { id } });
  }

  async invalidateByToken(token: string): Promise<void> {
    await Session.destroy({ where: { token } });
  }

  async invalidateByUserId(userId: string): Promise<void> {
    await Session.destroy({ where: { user_id: userId } });
  }
}
