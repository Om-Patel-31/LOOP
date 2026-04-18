import express from "express";
import path from "path";
import multer from "multer";
import Challenge from "../models/Challenge.js";
import Group from "../models/Group.js";
import Post from "../models/Post.js";

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, safe);
  },
});

const upload = multer({ storage });

const router = express.Router();

router.post(
  "/groups/:groupId/challenges/:challengeId/posts",
  upload.single("photo"),
  async (req, res) => {
    const { groupId, challengeId } = req.params;
    const group = await Group.findById(groupId);

    if (!group || group.isDeleted) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isMember = group.members.some((member) => member.userId === req.user.userId);

    if (!isMember) {
      return res.status(403).json({ error: "Only members can post" });
    }

    const challenge = await Challenge.findOne({ _id: challengeId, groupId });

    if (!challenge) {
      return res.status(404).json({ error: "Challenge not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Photo is required" });
    }

    const post = await Post.create({
      groupId,
      challengeId,
      author: { userId: req.user.userId, displayName: req.user.displayName },
      mediaUrl: `/uploads/${path.basename(req.file.path)}`,
      mediaMimeType: req.file.mimetype,
      mediaCipherMeta: {
        iv: req.body.mediaIv,
        keyVersion: Number(req.body.keyVersion || 1),
        algorithm: req.body.algorithm || "aes-256-gcm",
        isEncrypted: req.body.isEncrypted === "true",
      },
      caption: req.body.caption,
      captionCipherText: req.body.captionCipherText,
      captionIv: req.body.captionIv,
    });

    res.status(201).json(post);
  }
);

router.post("/posts/:id/likes", async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  if (post.likes.includes(req.user.userId)) {
    post.likes = post.likes.filter((id) => id !== req.user.userId);
  } else {
    post.likes.push(req.user.userId);
  }

  await post.save();
  res.json({ likes: post.likes.length, likedByUser: post.likes.includes(req.user.userId) });
});

router.post("/posts/:id/comments", async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }

  const comment = {
    userId: req.user.userId,
    displayName: req.user.displayName,
    text: req.body.text,
    cipherText: req.body.cipherText,
    iv: req.body.iv,
    keyVersion: Number(req.body.keyVersion || 1),
  };

  post.comments.push(comment);
  await post.save();

  res.status(201).json(post.comments[post.comments.length - 1]);
});

export default router;
