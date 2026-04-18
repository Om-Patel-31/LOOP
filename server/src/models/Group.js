import mongoose from "mongoose";

const memberSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    displayName: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
    controls: {
      muted: { type: Boolean, default: false },
      hidden: { type: Boolean, default: false },
      archived: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    inviteCode: { type: String, required: true, unique: true, index: true },
    challengeMode: { type: String, enum: ["daily", "custom"], default: "daily" },
    members: [memberSchema],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

const Group = mongoose.model("Group", groupSchema);

export default Group;
