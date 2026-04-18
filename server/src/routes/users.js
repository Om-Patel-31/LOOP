import express from "express";
import User from "../models/User.js";

const router = express.Router();

router.get("/:id/public-key", async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!user.authKeyBundle?.publicJwk) {
    return res.status(404).json({ error: "User public key not available" });
  }

  return res.json({ publicJwk: user.authKeyBundle.publicJwk });
});

export default router;
