export type AuthKeyBundle = {
  publicJwk: JsonWebKey;
  encryptedPrivateJwk: string;
  salt: string;
  iv: string;
  iterations: number;
  algorithm: string;
};

export type GroupKeyEnvelope = {
  userId: string;
  encryptedGroupKey: string;
  keyVersion?: number;
};

const unlockedGroupKeys = new Map<string, Uint8Array>();
let unlockedPrivateKey: CryptoKey | null = null;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(base64: string): Uint8Array {
  const text = atob(base64);
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as BufferSource;
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesToText(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

async function deriveWrappingKey(password: string, salt: Uint8Array) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(textToBytes(password)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: asBufferSource(salt),
      iterations: 310000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function importRsaPublicKey(publicJwk: JsonWebKey) {
  return crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

async function importRsaPrivateKey(privateJwk: JsonWebKey) {
  return crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

export async function createAuthKeyBundle(password: string): Promise<AuthKeyBundle> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv) },
    wrappingKey,
    asBufferSource(textToBytes(JSON.stringify(privateJwk)))
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

export async function unlockPrivateKey(password: string, bundle: AuthKeyBundle) {
  const wrappingKey = await deriveWrappingKey(password, fromBase64(bundle.salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(fromBase64(bundle.iv)) },
    wrappingKey,
    asBufferSource(fromBase64(bundle.encryptedPrivateJwk))
  );
  const privateJwk = JSON.parse(bytesToText(decrypted)) as JsonWebKey;
  unlockedPrivateKey = await importRsaPrivateKey(privateJwk);
  return unlockedPrivateKey;
}

export function setUnlockedPrivateKey(privateKey: CryptoKey | null) {
  unlockedPrivateKey = privateKey;
}

export function clearUnlockedKeys() {
  unlockedPrivateKey = null;
  unlockedGroupKeys.clear();
}

export function hasUnlockedPrivateKey() {
  return unlockedPrivateKey !== null;
}

export function getUnlockedPrivateKey() {
  return unlockedPrivateKey;
}

export function generateGroupSecret() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function encryptGroupKeyForRecipient(groupKey: Uint8Array, recipientPublicJwk: JsonWebKey) {
  const publicKey = await importRsaPublicKey(recipientPublicJwk);
  const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, asBufferSource(groupKey));

  return toBase64(new Uint8Array(encrypted));
}

export async function decryptGroupKeyEnvelope(encryptedGroupKey: string, privateKey = unlockedPrivateKey) {
  if (!privateKey) {
    throw new Error("Private key not unlocked");
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    asBufferSource(fromBase64(encryptedGroupKey))
  );

  return new Uint8Array(decrypted);
}

export function cacheGroupKey(groupId: string, groupKey: Uint8Array) {
  unlockedGroupKeys.set(groupId, groupKey);
}

export function clearGroupKey(groupId: string) {
  unlockedGroupKeys.delete(groupId);
}

export function clearAllGroupKeys() {
  unlockedGroupKeys.clear();
}

export function getCachedGroupKey(groupId: string) {
  return unlockedGroupKeys.get(groupId) || null;
}

export async function loadGroupKeyFromEnvelope(groupId: string, envelope: GroupKeyEnvelope, privateKey = unlockedPrivateKey) {
  const rawKey = await decryptGroupKeyEnvelope(envelope.encryptedGroupKey, privateKey || undefined);
  cacheGroupKey(groupId, rawKey);
  return rawKey;
}

export async function resolveGroupKey(groupId: string) {
  const cached = getCachedGroupKey(groupId);
  if (cached) {
    return cached;
  }

  throw new Error(`Group key for ${groupId} is not loaded`);
}

export async function encryptForGroup(groupId: string, plainText: string) {
  if (!plainText) {
    return { cipherText: "", iv: "" };
  }

  const groupKey = await resolveGroupKey(groupId);
  const importedKey = await crypto.subtle.importKey("raw", asBufferSource(groupKey), "AES-GCM", true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = textToBytes(plainText);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, importedKey, asBufferSource(encoded));

  return {
    cipherText: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  };
}

export async function decryptForGroup(groupId: string, cipherText?: string, iv?: string) {
  if (!cipherText || !iv) {
    return "";
  }

  try {
    const groupKey = await resolveGroupKey(groupId);
    const importedKey = await crypto.subtle.importKey("raw", asBufferSource(groupKey), "AES-GCM", true, ["encrypt", "decrypt"]);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asBufferSource(fromBase64(iv)) },
      importedKey,
      asBufferSource(fromBase64(cipherText))
    );

    return bytesToText(decrypted);
  } catch {
    return "Encrypted message (key not loaded)";
  }
}

export async function encryptMediaForGroup(groupId: string, file: File) {
  const groupKey = await resolveGroupKey(groupId);
  const importedKey = await crypto.subtle.importKey("raw", asBufferSource(groupKey), "AES-GCM", true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBufferSource(iv) }, importedKey, asBufferSource(bytes));

  return {
    encryptedBytes: new Uint8Array(encrypted),
    iv: toBase64(iv),
    algorithm: "aes-256-gcm",
    originalMimeType: file.type || "application/octet-stream",
  };
}

export async function decryptMediaForGroup(groupId: string, encryptedBytes: Uint8Array, iv: string) {
  const groupKey = await resolveGroupKey(groupId);
  const importedKey = await crypto.subtle.importKey("raw", asBufferSource(groupKey), "AES-GCM", true, ["encrypt", "decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(fromBase64(iv)) },
    importedKey,
    asBufferSource(encryptedBytes)
  );

  return new Uint8Array(decrypted);
}
