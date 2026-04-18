import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import app from "../app.js";
import User from "../models/User.js";
import Group from "../models/Group.js";

const demoAuthKeyBundle = {
  publicJwk: { kty: "RSA", n: "demo", e: "AQAB" },
  encryptedPrivateJwk: "demo",
  salt: "demo",
  iv: "demo",
  iterations: 1,
  algorithm: "demo",
};

describe("Loop API integration", () => {
  let mongoServer;
  let accessToken;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
    process.env.STORAGE_PROVIDER = "memory";

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Promise.all([User.deleteMany({}), Group.deleteMany({})]);
  });

  it("registers and creates a group", async () => {
    const registerRes = await request(app).post("/api/auth/register").send({
      email: "test@loop.dev",
      password: "password123",
      displayName: "Tester",
      authKeyBundle: demoAuthKeyBundle,
    });

    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.body.user.email).toBe("test@loop.dev");
    accessToken = registerRes.body.accessToken;

    const createRes = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Night Owls", challengeMode: "daily" });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.name).toBe("Night Owls");
    expect(createRes.body.memberCount).toBe(1);
  });

  it("enforces no leave and no member removal", async () => {
    const registerRes = await request(app).post("/api/auth/register").send({
      email: "rules@loop.dev",
      password: "password123",
      displayName: "Rules Tester",
      authKeyBundle: demoAuthKeyBundle,
    });

    accessToken = registerRes.body.accessToken;

    const createRes = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Rule Group", challengeMode: "daily" });

    const groupId = createRes.body.id;

    const leaveRes = await request(app)
      .post(`/api/groups/${groupId}/leave`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(leaveRes.statusCode).toBe(405);

    const removeRes = await request(app)
      .delete(`/api/groups/${groupId}/members/anything`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(removeRes.statusCode).toBe(405);
  });

  it("uploads encrypted media and returns access details", async () => {
    const registerRes = await request(app).post("/api/auth/register").send({
      email: "media@loop.dev",
      password: "password123",
      displayName: "Media Tester",
      authKeyBundle: demoAuthKeyBundle,
    });

    accessToken = registerRes.body.accessToken;

    const groupRes = await request(app)
      .post("/api/groups")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Media Group", challengeMode: "daily" });

    const challengeRes = await request(app)
      .post(`/api/groups/${groupRes.body.id}/challenges`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        prompt: "Share your encrypted sunrise",
        type: "daily",
      });

    const uploadRes = await request(app)
      .post(`/api/groups/${groupRes.body.id}/challenges/${challengeRes.body._id}/posts`)
      .set("Authorization", `Bearer ${accessToken}`)
      .field("isEncrypted", "true")
      .field("mediaIv", "iv-demo")
      .field("algorithm", "aes-256-gcm")
      .field("originalMimeType", "image/jpeg")
      .attach("photo", Buffer.from("encrypted-bytes"), {
        filename: "photo.bin",
        contentType: "application/octet-stream",
      });

    expect(uploadRes.statusCode).toBe(201);
    expect(uploadRes.body.mediaProvider).toBe("memory");

    const accessRes = await request(app)
      .get(`/api/posts/${uploadRes.body._id}/media-access`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(accessRes.statusCode).toBe(200);
    expect(accessRes.body.mode).toBe("inline");
    expect(accessRes.body.base64).toBeTruthy();
  });
});
