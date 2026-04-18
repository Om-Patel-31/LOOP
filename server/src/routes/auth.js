import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { hashToken } from "../utils/security.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
  };
}

function sanitizeAuthKeyBundle(bundle) {
  if (!bundle) {
    return null;
  }

  return {
    publicJwk: bundle.publicJwk,
    encryptedPrivateJwk: bundle.encryptedPrivateJwk,
    salt: bundle.salt,
    iv: bundle.iv,
    iterations: bundle.iterations,
    algorithm: bundle.algorithm,
  };
}

function setAuthCookies(res, accessToken, refreshToken) {
  const baseCookie = {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  };

  res.cookie("loop_access", accessToken, {
    ...baseCookie,
    maxAge: 1000 * 60 * 15,
  });

  res.cookie("loop_refresh", refreshToken, {
    ...baseCookie,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

router.post("/register", async (req, res) => {
  const { email, password, displayName, authKeyBundle } = req.body;

  if (!email?.trim() || !password?.trim() || !displayName?.trim() || !authKeyBundle?.encryptedPrivateJwk) {
    return res.status(400).json({ error: "Email, password, and display name are required" });
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });

  if (existing) {
    return res.status(409).json({ error: "User already exists" });
  }

  const user = await User.create({
    email: email.toLowerCase().trim(),
    displayName: displayName.trim(),
    passwordHash: await bcrypt.hash(password, 10),
    authKeyBundle,
  });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();

  setAuthCookies(res, accessToken, refreshToken);

  return res.status(201).json({
    user: sanitizeUser(user),
    accessToken,
    authKeyBundle: sanitizeAuthKeyBundle(user.authKeyBundle),
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email?.toLowerCase().trim() });

  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();

  setAuthCookies(res, accessToken, refreshToken);

  return res.json({
    user: sanitizeUser(user),
    accessToken,
    authKeyBundle: sanitizeAuthKeyBundle(user.authKeyBundle),
  });
});

router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies.loop_refresh || req.body.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: "Missing refresh token" });
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: "Invalid refresh token" });
  }

  const user = await User.findById(payload.sub);

  if (!user || !user.refreshTokenHash || user.refreshTokenHash !== hashToken(refreshToken)) {
    return res.status(401).json({ error: "Refresh token rejected" });
  }

  const accessToken = signAccessToken(user);
  const nextRefreshToken = signRefreshToken(user);

  user.refreshTokenHash = hashToken(nextRefreshToken);
  await user.save();

  setAuthCookies(res, accessToken, nextRefreshToken);

  return res.json({
    user: sanitizeUser(user),
    accessToken,
    authKeyBundle: sanitizeAuthKeyBundle(user.authKeyBundle),
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.user.userId, { $unset: { refreshTokenHash: 1 } });

  res.clearCookie("loop_access", { path: "/" });
  res.clearCookie("loop_refresh", { path: "/" });

  res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({ user: sanitizeUser(user), authKeyBundle: sanitizeAuthKeyBundle(user.authKeyBundle) });
});

export default router;
