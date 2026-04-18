export function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

export function normalizeGroupForUser(group, userId) {
  const memberState = group.members.find((member) => member.userId === userId);

  return {
    id: group.id,
    name: group.name,
    inviteCode: group.inviteCode,
    challengeMode: group.challengeMode,
    controls: memberState?.controls || { muted: false, hidden: false, archived: false },
    memberCount: group.members.length,
    members: group.members,
    updatedAt: group.updatedAt,
    createdAt: group.createdAt,
  };
}
