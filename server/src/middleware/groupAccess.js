import Group from "../models/Group.js";

export async function requireGroupMembership(req, res, next) {
  const groupId = req.params.groupId || req.params.id;

  if (!groupId) {
    return res.status(400).json({ error: "Missing group id" });
  }

  const group = await Group.findById(groupId);

  if (!group || group.isDeleted) {
    return res.status(404).json({ error: "Group not found" });
  }

  const isMember = group.members.some((member) => member.userId === req.user.userId);

  if (!isMember) {
    return res.status(403).json({ error: "Not a group member" });
  }

  req.group = group;
  next();
}
