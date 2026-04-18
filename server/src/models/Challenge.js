import mongoose from "mongoose";

const challengeSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    prompt: { type: String, required: true, trim: true },
    type: { type: String, enum: ["daily", "custom"], default: "custom" },
    scheduledFor: { type: Date, required: true },
    createdBy: {
      userId: { type: String, required: true },
      displayName: { type: String, required: true },
    },
  },
  { timestamps: true }
);

const Challenge = mongoose.model("Challenge", challengeSchema);

export default Challenge;
