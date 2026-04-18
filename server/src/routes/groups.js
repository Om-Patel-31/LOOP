import express from "express";
import Group from "../models/Group.js";
import Challenge from "../models/Challenge.js";
import Post from "../models/Post.js";
import { requireGroupMembership } from "../middleware/groupAccess.js";
import { generateInviteCode, normalizeGroupForUser } from "../utils/groupHelpers.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const groups = await Group.find({ "members.userId": req.user.userId, isDeleted: false }).sort({ updatedAt: -1 });
  res.json(groups.map((group) => normalizeGroupForUser(group, req.user.userId)));
});

router.post("/", async (req, res) => {
  const { name, challengeMode = "daily", initialKeyEnvelope } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: "Group name is required" });
  }

  const group = await Group.create({
    name: name.trim(),
    challengeMode,
    inviteCode: generateInviteCode(),
    keyEnvelopes: initialKeyEnvelope
      ? [
          {
            userId: req.user.userId,
            encryptedGroupKey: initialKeyEnvelope.encryptedGroupKey,
            keyVersion: Number(initialKeyEnvelope.keyVersion || 1),
          },
        ]
      : [],
    members: [
      {
        userId: req.user.userId,
        displayName: req.user.displayName,
      },
    ],
  });

  res.status(201).json(normalizeGroupForUser(group, req.user.userId));
});

router.post("/join", async (req, res) => {
  const { inviteCode } = req.body;

  if (!inviteCode) {
    return res.status(400).json({ error: "Invite code is required" });
  }

  const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase(), isDeleted: false });

  if (!group) {
    return res.status(404).json({ error: "Invalid invite code" });
  }

  const alreadyMember = group.members.some((member) => member.userId === req.user.userId);

  if (!alreadyMember) {
    group.members.push({ userId: req.user.userId, displayName: req.user.displayName });
    await group.save();
  }

  res.json(normalizeGroupForUser(group, req.user.userId));
});

router.patch("/:id", requireGroupMembership, async (req, res) => {
  const { name, challengeMode } = req.body;

  if (name?.trim()) {
    req.group.name = name.trim();
  }

  if (["daily", "custom"].includes(challengeMode)) {
    req.group.challengeMode = challengeMode;
  }

  await req.group.save();

  res.json(normalizeGroupForUser(req.group, req.user.userId));
});

router.patch("/:id/controls", requireGroupMembership, async (req, res) => {
  const { muted, hidden, archived } = req.body;
  const member = req.group.members.find((item) => item.userId === req.user.userId);

  if (typeof muted === "boolean") member.controls.muted = muted;
  if (typeof hidden === "boolean") member.controls.hidden = hidden;
  if (typeof archived === "boolean") member.controls.archived = archived;

  await req.group.save();
  res.json(normalizeGroupForUser(req.group, req.user.userId));
});

router.delete("/:id", requireGroupMembership, async (req, res) => {
  req.group.isDeleted = true;
  req.group.deletedAt = new Date();
  await req.group.save();

  await Challenge.updateMany({ groupId: req.group._id }, { $set: { deletedAt: new Date() } });

  res.status(204).send();
});

router.post("/:id/leave", (_req, res) => {
  res.status(405).json({
    error: "Users cannot leave groups. Delete the group instead.",
  });
});

router.get("/:id/key-envelope", requireGroupMembership, async (req, res) => {
  const envelope = req.group.keyEnvelopes.find((item) => item.userId === req.user.userId);

  if (!envelope) {
    return res.status(404).json({ error: "No key envelope available for this user" });
  }

  res.json(envelope);
});

router.post("/:id/key-envelopes", requireGroupMembership, async (req, res) => {
  const { userId, encryptedGroupKey, keyVersion = 1 } = req.body;

  if (!userId || !encryptedGroupKey) {
    return res.status(400).json({ error: "userId and encryptedGroupKey are required" });
  }

  const targetIsMember = req.group.members.some((member) => member.userId === userId);

  if (!targetIsMember) {
    return res.status(404).json({ error: "Target user is not a group member" });
  }

  req.group.keyEnvelopes = req.group.keyEnvelopes.filter((item) => item.userId !== userId);
  req.group.keyEnvelopes.push({ userId, encryptedGroupKey, keyVersion: Number(keyVersion) });
  await req.group.save();

  res.status(201).json({ userId, keyVersion: Number(keyVersion) });
});

router.delete("/:id/members/:memberId", (_req, res) => {
  res.status(405).json({
    error: "No member removal is allowed in Loop. All group permissions are equal.",
  });
});

router.get("/:id/feed", requireGroupMembership, async (req, res) => {
  const posts = await Post.find({ groupId: req.group._id }).sort({ createdAt: -1 }).limit(100);
  res.json(posts);
});

export default router;
