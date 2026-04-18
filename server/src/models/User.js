import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    authKeyBundle: {
      publicJwk: { type: mongoose.Schema.Types.Mixed, required: true },
      encryptedPrivateJwk: { type: String, required: true },
      salt: { type: String, required: true },
      iv: { type: String, required: true },
      iterations: { type: Number, required: true },
      algorithm: { type: String, required: true },
    },
    refreshTokenHash: { type: String },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
