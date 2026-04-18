import { userRepository } from "@/modules/user/user.repository";
import { User } from "@/modules/user/user.entity";
import { generateRefreshToken } from "@/utils/jwt";
import {
  emailAlreadyExistsError,
  inactiveUserError,
  invalidCredentialsError,
  userNotFoundError,
} from "@/modules/user/user.errors";
import { CreateUserInput } from "@/modules/user/user.schema";

export class AuthService {
  async signIn(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw userNotFoundError();

    const valid = await userRepository.validatePassword(user, password);
    if (!valid) throw invalidCredentialsError();

    if (!user.status) throw inactiveUserError();

    const refreshToken = generateRefreshToken(user);
    return { user, refreshToken };
  }

  async signUp(data: CreateUserInput) {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) throw emailAlreadyExistsError();

    const user = await userRepository.create(data as Partial<User>);
    return { user };
  }

  async getMe(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw userNotFoundError();
    if (!user.status) throw inactiveUserError();
    return { user };
  }
}
