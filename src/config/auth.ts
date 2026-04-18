export const authConfig = {
  secret: `${process.env.JWT_SECRET}`,
  refreshSecret: `${process.env.JWT_REFRESH_SECRET}`,
  secretKeyForget: `${process.env.JWT_SECRET}`,
  expiresIn: `${process.env.JWT_EXPIRES_IN ?? "7d"}`,
  bcryptSaltRounds: 8,
};
