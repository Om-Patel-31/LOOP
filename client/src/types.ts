export type GroupControls = {
  muted: boolean;
  hidden: boolean;
  archived: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

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

export type GroupMember = {
  userId: string;
  displayName: string;
  joinedAt: string;
  controls: GroupControls;
};

export type LoopGroup = {
  id: string;
  name: string;
  inviteCode: string;
  challengeMode: "daily" | "custom";
  controls: GroupControls;
  memberCount: number;
  members: GroupMember[];
  createdAt: string;
  updatedAt: string;
};

export type Challenge = {
  _id: string;
  groupId: string;
  prompt: string;
  type: "daily" | "custom";
  scheduledFor: string;
  createdAt: string;
};

export type Comment = {
  _id: string;
  userId: string;
  displayName: string;
  text?: string;
  cipherText?: string;
  iv?: string;
  keyVersion?: number;
  createdAt: string;
};

export type Post = {
  _id: string;
  groupId: string;
  challengeId: string;
  author: { userId: string; displayName: string };
  mediaObjectKey: string;
  mediaProvider: "s3" | "gcs" | "memory";
  mediaBucket: string;
  mediaMimeType: string;
  mediaCipherMeta: {
    iv?: string;
    keyVersion?: number;
    algorithm?: string;
    isEncrypted?: boolean;
  };
  caption?: string;
  captionCipherText?: string;
  captionIv?: string;
  likes: string[];
  comments: Comment[];
  createdAt: string;
};
