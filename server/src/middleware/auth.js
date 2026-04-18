import { verifyAccessToken } from "../utils/jwt.js";

function extractToken(req) {
  const authHeader = req.header("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  if (req.cookies?.loop_access) {
    return req.cookies.loop_access;
  }

  return null;
}

export function optionalAuth(req, _res, next) {
  const token = extractToken(req);

  if (!token) {
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
    };
  } catch {
    req.user = undefined;
  }

  return next();
}

export function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
    };

    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
