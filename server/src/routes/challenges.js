import express from "express";
import Challenge from "../models/Challenge.js";
import { requireGroupMembership } from "../middleware/groupAccess.js";

const router = express.Router({ mergeParams: true });

router.get("/", requireGroupMembership, async (req, res) => {
  const challenges = await Challenge.find({ groupId: req.group._id }).sort({ scheduledFor: -1 });
  res.json(challenges);
});

router.post("/", requireGroupMembership, async (req, res) => {
  const { prompt, type = "custom", scheduledFor } = req.body;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: "Challenge prompt is required" });
  }

  const challenge = await Challenge.create({
    groupId: req.group._id,
    prompt: prompt.trim(),
    type,
    scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
    createdBy: {
      userId: req.user.userId,
      displayName: req.user.displayName,
    },
  });

  res.status(201).json(challenge);
});

export default router;
