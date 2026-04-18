import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { webcrypto } from "node:crypto";
import { config } from "../config.js";
import User from "../models/User.js";
import Group from "../models/Group.js";
import Challenge from "../models/Challenge.js";
import Post from "../models/Post.js";

const { subtle } = webcrypto;
const encoder = new TextEncoder();

function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function deriveWrappingKey(password, salt) {
  const passwordKey = await subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 310000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function createAuthKeyBundle(password) {
  const keyPair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await subtle.exportKey("jwk", keyPair.privateKey);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(password, salt);
  const encrypted = await subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    encoder.encode(JSON.stringify(privateJwk))
  );

  return {
    publicJwk,
    encryptedPrivateJwk: toBase64(new Uint8Array(encrypted)),
    salt: toBase64(salt),
    iv: toBase64(iv),
    iterations: 310000,
    algorithm: "PBKDF2-AES-GCM",
  };
}

async function run() {
  await mongoose.connect(config.mongoUri);

  await Promise.all([User.deleteMany({}), Group.deleteMany({}), Challenge.deleteMany({}), Post.deleteMany({})]);

  const alexBundle = await createAuthKeyBundle("password123");
  const miraBundle = await createAuthKeyBundle("password123");

  const users = await User.insertMany([
    {
      email: "alex@loop.dev",
      displayName: "Alex",
      passwordHash: await bcrypt.hash("password123", 10),
      authKeyBundle: alexBundle,
    },
    {
      email: "mira@loop.dev",
      displayName: "Mira",
      passwordHash: await bcrypt.hash("password123", 10),
      authKeyBundle: miraBundle,
    },
  ]);

  const group = await Group.create({
    name: "Golden Hour Friends",
    inviteCode: "LOOP2026",
    challengeMode: "daily",
    members: users.map((user) => ({
      userId: user._id.toString(),
      displayName: user.displayName,
    })),
  });

  const challenge = await Challenge.create({
    groupId: group._id,
    prompt: "Capture something warm-toned from your timezone.",
    type: "daily",
    scheduledFor: new Date(),
    createdBy: {
      userId: users[0]._id.toString(),
      displayName: users[0].displayName,
    },
  });

  await Post.create({
    groupId: group._id,
    challengeId: challenge._id,
    author: {
      userId: users[1]._id.toString(),
      displayName: users[1].displayName,
    },
    mediaObjectKey: "seed/demo/encrypted-photo.bin",
    mediaProvider: "memory",
    mediaBucket: "memory",
    mediaMimeType: "application/octet-stream",
    mediaCipherMeta: {
      iv: "seed-iv",
      keyVersion: 1,
      algorithm: "aes-256-gcm",
      isEncrypted: true,
    },
    captionCipherText: "seed-caption-ciphertext",
    captionIv: "seed-caption-iv",
    likes: [users[0]._id.toString()],
    comments: [
      {
        userId: users[0]._id.toString(),
        displayName: users[0].displayName,
        cipherText: "seed-comment-ciphertext",
        iv: "seed-comment-iv",
        keyVersion: 1,
      },
    ],
  });

  console.log("Seed complete");
  console.log("Demo users:");
  console.log("- alex@loop.dev / password123");
  console.log("- mira@loop.dev / password123");

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Seed failed", error);
  await mongoose.disconnect();
  process.exit(1);
});
