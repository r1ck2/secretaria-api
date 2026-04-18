import bcrypt from "bcryptjs";
import { User } from "./user.entity";

export const userRepository = {
  async findByEmail(email: string) {
    return User.findOne({ where: { email } });
  },

  async findById(id: string) {
    return User.findByPk(id);
  },

  async create(data: Partial<User>) {
    return User.create(data as any);
  },

  async validatePassword(user: User, password: string) {
    return bcrypt.compare(password, user.password_hash);
  },
};
