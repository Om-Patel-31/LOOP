import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
    },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessTtl }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      tokenType: "refresh",
    },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshTtl }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtAccessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwtRefreshSecret);
}
