import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    displayName: { type: String, required: true },
    text: { type: String },
    cipherText: { type: String },
    iv: { type: String },
    keyVersion: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const postSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: "Challenge", required: true, index: true },
    author: {
      userId: { type: String, required: true },
      displayName: { type: String, required: true },
    },
    mediaUrl: { type: String, required: true },
    mediaMimeType: { type: String, required: true },
    mediaCipherMeta: {
      iv: { type: String },
      keyVersion: { type: Number, default: 1 },
      algorithm: { type: String, default: "aes-256-gcm" },
      isEncrypted: { type: Boolean, default: false },
    },
    caption: { type: String },
    captionCipherText: { type: String },
    captionIv: { type: String },
    likes: [{ type: String }],
    comments: [commentSchema],
  },
  { timestamps: true }
);

const Post = mongoose.model("Post", postSchema);

export default Post;
