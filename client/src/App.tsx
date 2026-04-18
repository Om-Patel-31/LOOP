import { FormEvent, useEffect, useMemo, useState } from "react";
import api, { login, logout, me, refresh, register, setAuthToken } from "./api";
import {
  AuthKeyBundle,
  AuthUser,
  Challenge,
  GroupKeyEnvelope,
  LoopGroup,
  Post,
} from "./types";
import {
  cacheGroupKey,
  clearAllGroupKeys,
  clearUnlockedKeys,
  createAuthKeyBundle,
  decryptForGroup,
  decryptMediaForGroup,
  encryptForGroup,
  encryptGroupKeyForRecipient,
  encryptMediaForGroup,
  generateGroupSecret,
  getCachedGroupKey,
  loadGroupKeyFromEnvelope,
  resolveGroupKey,
  unlockPrivateKey,
} from "./crypto";

type DraftComments = Record<string, string>;
type ResolvedCaptions = Record<string, string>;
type DecryptedComments = Record<string, string>;
type MediaUrls = Record<string, string>;

const TOKEN_STORAGE_KEY = "loop-access-token";

export default function App() {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authKeyBundle, setAuthKeyBundle] = useState<AuthKeyBundle | null>(null);
  const [keysUnlocked, setKeysUnlocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [shareTargetUserId, setShareTargetUserId] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));

  const [groups, setGroups] = useState<LoopGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>("");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [challengePrompt, setChallengePrompt] = useState("");
  const [challengeType, setChallengeType] = useState<"daily" | "custom">("custom");
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [encryptCaption, setEncryptCaption] = useState(true);
  const [commentDrafts, setCommentDrafts] = useState<DraftComments>({});

  const [resolvedCaptions, setResolvedCaptions] = useState<ResolvedCaptions>({});
  const [resolvedComments, setResolvedComments] = useState<DecryptedComments>({});
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<MediaUrls>({});

  useEffect(() => {
    setAuthToken(token);

    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, [token]);

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        if (token) {
          const auth = await me();
          setCurrentUser(auth.user);
          setAuthKeyBundle(auth.authKeyBundle);
          setKeysUnlocked(false);
          return;
        }

        const refreshed = await refresh();
        setToken(refreshed.accessToken);
        setCurrentUser(refreshed.user);
        setAuthKeyBundle(refreshed.authKeyBundle);
        setKeysUnlocked(false);
      } catch {
        setCurrentUser(null);
        setToken(null);
        setAuthKeyBundle(null);
        setKeysUnlocked(false);
      } finally {
        setAuthLoading(false);
      }
    };

    void bootstrapAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void loadGroups();
  }, [currentUser]);

  useEffect(() => {
    if (!activeGroupId) return;
    void (async () => {
      try {
        await loadGroupKey(activeGroupId);
      } catch {
        // The group key may not have been shared to this device yet.
      }

      await Promise.all([loadChallenges(activeGroupId), loadFeed(activeGroupId)]);
    })();
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId || !keysUnlocked) {
      return;
    }

    void loadGroupKey(activeGroupId);
  }, [activeGroupId, keysUnlocked]);

  useEffect(() => {
    return () => {
      for (const mediaUrl of Object.values(resolvedMediaUrls)) {
        if (mediaUrl.startsWith("blob:")) {
          URL.revokeObjectURL(mediaUrl);
        }
      }
    };
  }, [resolvedMediaUrls]);

  useEffect(() => {
    const run = async () => {
      if (!activeGroupId || posts.length === 0 || !keysUnlocked) return;

      const captionEntries: Array<[string, string]> = [];
      const commentEntries: Array<[string, string]> = [];

      for (const post of posts) {
        if (post.captionCipherText && post.captionIv) {
          const value = await decryptForGroup(activeGroupId, post.captionCipherText, post.captionIv);
          captionEntries.push([post._id, value]);
        } else {
          captionEntries.push([post._id, post.caption || ""]);
        }

        for (const comment of post.comments) {
          const key = `${post._id}:${comment._id}`;
          if (comment.cipherText && comment.iv) {
            commentEntries.push([key, await decryptForGroup(activeGroupId, comment.cipherText, comment.iv)]);
          } else {
            commentEntries.push([key, comment.text || ""]);
          }
        }
      }

      setResolvedCaptions(Object.fromEntries(captionEntries));
      setResolvedComments(Object.fromEntries(commentEntries));
    };

    void run();
  }, [activeGroupId, posts, keysUnlocked]);

  useEffect(() => {
    const run = async () => {
      if (!activeGroupId || posts.length === 0 || !keysUnlocked) {
        setResolvedMediaUrls({});
        return;
      }

      const mediaMap: MediaUrls = {};

      for (const post of posts) {
        try {
          const mediaAccess = await api.get<{ mode: "url" | "inline"; url?: string; base64?: string }>(
            `/posts/${post._id}/media-access`
          );

          let encryptedBytes: Uint8Array;

          if (mediaAccess.data.mode === "url" && mediaAccess.data.url) {
            const response = await fetch(mediaAccess.data.url);
            encryptedBytes = new Uint8Array(await response.arrayBuffer());
          } else if (mediaAccess.data.mode === "inline" && mediaAccess.data.base64) {
            const decoded = atob(mediaAccess.data.base64);
            encryptedBytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
          } else {
            continue;
          }

          const iv = post.mediaCipherMeta?.iv;

          if (!iv) {
            continue;
          }

          const decrypted = await decryptMediaForGroup(activeGroupId, encryptedBytes, iv);
          const blob = new Blob([decrypted], { type: post.mediaMimeType || "image/jpeg" });
          mediaMap[post._id] = URL.createObjectURL(blob);
        } catch {
          mediaMap[post._id] = "";
        }
      }

      setResolvedMediaUrls(mediaMap);
    };

    void run();
  }, [activeGroupId, posts, keysUnlocked]);

  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId), [groups, activeGroupId]);

  async function loadGroupKey(groupId: string) {
    if (!authKeyBundle || !keysUnlocked || getCachedGroupKey(groupId)) {
      return;
    }

    const response = await api.get<GroupKeyEnvelope>(`/groups/${groupId}/key-envelope`);
    await loadGroupKeyFromEnvelope(groupId, response.data);
  }

  async function unlockAccountKeys(password: string, bundle = authKeyBundle) {
    if (!bundle) {
      throw new Error("Missing auth key bundle");
    }

    await unlockPrivateKey(password, bundle);
    setKeysUnlocked(true);
  }

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    try {
      const authBundle = authMode === "register" ? await createAuthKeyBundle(authPassword) : undefined;
      const auth =
        authMode === "login"
          ? await login({ email: authEmail, password: authPassword })
          : await register({ email: authEmail, password: authPassword, displayName: authDisplayName, authKeyBundle: authBundle! });

      setToken(auth.accessToken);
      setCurrentUser(auth.user);
      setAuthKeyBundle(auth.authKeyBundle);
      await unlockAccountKeys(authPassword, auth.authKeyBundle);
      setUnlockPassword("");
    } catch {
      setError("Authentication failed. Check credentials and try again.");
    }
  }

  async function handleUnlockKeys(e: FormEvent) {
    e.preventDefault();

    if (!authKeyBundle) {
      return;
    }

    try {
      await unlockAccountKeys(unlockPassword);
      setUnlockPassword("");
    } catch {
      setError("Unable to unlock keys with that password.");
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Ignore logout API failures and clear local auth state.
    }

    setToken(null);
    setCurrentUser(null);
    setAuthKeyBundle(null);
    setKeysUnlocked(false);
    clearUnlockedKeys();
    clearAllGroupKeys();
    setGroups([]);
    setChallenges([]);
    setPosts([]);
    setActiveGroupId("");
  }

  async function loadGroups() {
    setLoading(true);
    setError("");
    try {
      const response = await api.get<LoopGroup[]>("/groups");
      setGroups(response.data);
      if (!activeGroupId && response.data[0]) {
        setActiveGroupId(response.data[0].id);
      }
    } catch {
      setError("Failed to load groups. Make sure API is running.");
    } finally {
      setLoading(false);
    }
  }

  async function loadChallenges(groupId: string) {
    const response = await api.get<Challenge[]>(`/groups/${groupId}/challenges`);
    setChallenges(response.data);
    if (!selectedChallengeId && response.data[0]) {
      setSelectedChallengeId(response.data[0]._id);
    }
  }

  async function loadFeed(groupId: string) {
    const response = await api.get<Post[]>(`/groups/${groupId}/feed`);
    setPosts(response.data);
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim() || !authKeyBundle || !keysUnlocked) return;

    const groupKey = generateGroupSecret();
    const encryptedGroupKey = await encryptGroupKeyForRecipient(groupKey, authKeyBundle.publicJwk);

    const response = await api.post("/groups", {
      name: newGroupName,
      challengeMode: "daily",
      initialKeyEnvelope: {
        encryptedGroupKey,
        keyVersion: 1,
      },
    });

    cacheGroupKey(response.data.id, groupKey);
    setNewGroupName("");
    await loadGroups();
  }

  async function joinGroup(e: FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;

    await api.post("/groups/join", { inviteCode: joinCode.toUpperCase() });
    setJoinCode("");
    await loadGroups();
  }

  async function updateGroupControls(payload: Partial<LoopGroup["controls"]>) {
    if (!activeGroupId) return;
    await api.patch(`/groups/${activeGroupId}/controls`, payload);
    await loadGroups();
  }

  async function createChallenge(e: FormEvent) {
    e.preventDefault();
    if (!activeGroupId || !challengePrompt.trim()) return;

    await api.post(`/groups/${activeGroupId}/challenges`, {
      prompt: challengePrompt,
      type: challengeType,
      scheduledFor: new Date().toISOString(),
    });

    setChallengePrompt("");
    await loadChallenges(activeGroupId);
  }

  async function shareGroupKey(e: FormEvent) {
    e.preventDefault();

    if (!activeGroupId || !shareTargetUserId || !authKeyBundle || !keysUnlocked) {
      return;
    }

    try {
      const groupKey = await resolveGroupKey(activeGroupId);
      const targetKeyResponse = await api.get<{ publicJwk: JsonWebKey }>(`/users/${shareTargetUserId}/public-key`);
      const encryptedGroupKey = await encryptGroupKeyForRecipient(groupKey, targetKeyResponse.data.publicJwk);

      await api.post(`/groups/${activeGroupId}/key-envelopes`, {
        userId: shareTargetUserId,
        encryptedGroupKey,
        keyVersion: 1,
      });

      setShareStatus(`Shared key with ${shareTargetUserId}`);
    } catch {
      setShareStatus("Unable to share the group key.");
    }
  }

  async function uploadResponse(e: FormEvent) {
    e.preventDefault();
    if (!activeGroupId || !selectedChallengeId || !selectedPhoto) return;

    const encryptedMedia = await encryptMediaForGroup(activeGroupId, selectedPhoto);
    const body = new FormData();
    body.append(
      "photo",
      new Blob([encryptedMedia.encryptedBytes], { type: "application/octet-stream" }),
      `${selectedPhoto.name}.enc`
    );
    body.append("isEncrypted", "true");
    body.append("mediaIv", encryptedMedia.iv);
    body.append("algorithm", encryptedMedia.algorithm);
    body.append("originalMimeType", encryptedMedia.originalMimeType);

    if (caption.trim()) {
      if (encryptCaption) {
        const encrypted = await encryptForGroup(activeGroupId, caption);
        body.append("captionCipherText", encrypted.cipherText);
        body.append("captionIv", encrypted.iv);
      } else {
        body.append("caption", caption);
      }
    }

    await api.post(`/groups/${activeGroupId}/challenges/${selectedChallengeId}/posts`, body);
    setSelectedPhoto(null);
    setCaption("");
    await loadFeed(activeGroupId);
  }

  async function toggleLike(postId: string) {
    await api.post(`/posts/${postId}/likes`);
    if (activeGroupId) {
      await loadFeed(activeGroupId);
    }
  }

  async function addComment(e: FormEvent, postId: string) {
    e.preventDefault();

    const text = commentDrafts[postId]?.trim();
    if (!text || !activeGroupId) return;

    const encrypted = await encryptForGroup(activeGroupId, text);
    await api.post(`/posts/${postId}/comments`, {
      cipherText: encrypted.cipherText,
      iv: encrypted.iv,
      keyVersion: 1,
    });

    setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    await loadFeed(activeGroupId);
  }

  async function deleteGroup() {
    if (!activeGroupId) return;

    await api.delete(`/groups/${activeGroupId}`);
    setActiveGroupId("");
    setChallenges([]);
    setPosts([]);
    await loadGroups();
  }

  return (
    <div className="page-shell">
      <header className="app-header">
        <h1>Loop</h1>
        <p>Intentional connection across time zones through shared creative challenges.</p>

        {currentUser ? (
          <div className="identity-row">
            <p>
              Signed in as <strong>{currentUser.displayName}</strong> ({currentUser.email})
            </p>
            <button type="button" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        ) : null}
      </header>

      {authLoading ? <p>Checking session...</p> : null}

      {!authLoading && !currentUser ? (
        <section className="panel auth-panel">
          <h2>{authMode === "login" ? "Welcome Back" : "Create Your Loop Account"}</h2>
          <form onSubmit={handleAuthSubmit}>
            <input
              aria-label="Email"
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="you@loop.dev"
              required
            />
            <input
              aria-label="Password"
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
              required
            />
            {authMode === "register" ? (
              <input
                aria-label="Display Name"
                value={authDisplayName}
                onChange={(e) => setAuthDisplayName(e.target.value)}
                placeholder="Display name"
                required
              />
            ) : null}
            <button type="submit">{authMode === "login" ? "Log In" : "Register"}</button>
            <button
              type="button"
              onClick={() => setAuthMode((prev) => (prev === "login" ? "register" : "login"))}
            >
              {authMode === "login" ? "Need an account? Register" : "Already have an account? Log in"}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
        </section>
      ) : null}

      {!authLoading && currentUser && !keysUnlocked ? (
        <section className="panel auth-panel">
          <h2>Unlock Your Keys</h2>
          <p>Your account is signed in, but your private key needs to be unlocked on this device.</p>
          <form onSubmit={handleUnlockKeys}>
            <input
              aria-label="Unlock password"
              type="password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder="Account password"
              required
            />
            <button type="submit">Unlock Keys</button>
          </form>
        </section>
      ) : null}

      {!authLoading && currentUser && keysUnlocked ? (
        <main className="layout">
          <aside className="panel sidebar">
            <section>
              <h2>Your Groups</h2>
              {loading ? <p>Loading...</p> : null}
              {groups.map((group) => (
                <button
                  className={`group-item ${group.id === activeGroupId ? "active" : ""}`}
                  key={group.id}
                  onClick={() => setActiveGroupId(group.id)}
                  type="button"
                >
                  <span>{group.name}</span>
                  <small>
                    code {group.inviteCode} | {group.memberCount} members
                  </small>
                  <small>
                    {group.controls.muted ? "Muted" : "Unmuted"} | {group.controls.hidden ? "Hidden" : "Visible"} |{" "}
                    {group.controls.archived ? "Archived" : "Live"}
                  </small>
                </button>
              ))}
            </section>

            <form onSubmit={createGroup}>
              <h3>Create Group</h3>
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Sunset Hunters"
                required
              />
              <button type="submit">Create</button>
            </form>

            <form onSubmit={joinGroup}>
              <h3>Join Group</h3>
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Invite code" required />
              <button type="submit">Join</button>
            </form>
          </aside>

          <section className="panel content">
            {!activeGroup ? (
              <p>Create or join a group to get started.</p>
            ) : (
              <>
                <div className="group-top-row">
                  <div>
                    <h2>{activeGroup.name}</h2>
                    <p>All members are equal. No admins. No removals. No leaving except full group deletion.</p>
                  </div>
                  <div className="controls">
                    <button type="button" onClick={() => updateGroupControls({ muted: !activeGroup.controls.muted })}>
                      {activeGroup.controls.muted ? "Unmute" : "Mute"}
                    </button>
                    <button type="button" onClick={() => updateGroupControls({ hidden: !activeGroup.controls.hidden })}>
                      {activeGroup.controls.hidden ? "Unhide" : "Hide"}
                    </button>
                    <button type="button" onClick={() => updateGroupControls({ archived: !activeGroup.controls.archived })}>
                      {activeGroup.controls.archived ? "Unarchive" : "Archive"}
                    </button>
                    <button className="danger" type="button" onClick={deleteGroup}>
                      Delete Group
                    </button>
                  </div>
                </div>

                <form className="card share-card" onSubmit={shareGroupKey}>
                  <h3>Share Group Key</h3>
                  <p className="tiny">Wrap this group secret for another member's public key so they can unlock it on any device.</p>
                  <select
                    aria-label="Group key share target"
                    value={shareTargetUserId}
                    onChange={(e) => setShareTargetUserId(e.target.value)}
                    required
                  >
                    <option value="">Choose a member</option>
                    {activeGroup.members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName} ({member.userId})
                      </option>
                    ))}
                  </select>
                  <button type="submit">Share Key</button>
                  {shareStatus ? <p className="tiny">{shareStatus}</p> : null}
                </form>

                <div className="card-grid">
                  <form className="card" onSubmit={createChallenge}>
                    <h3>New Challenge</h3>
                    <textarea
                      value={challengePrompt}
                      onChange={(e) => setChallengePrompt(e.target.value)}
                      placeholder="Upload something yellow from your day"
                      required
                    />
                    <select
                      aria-label="Challenge type"
                      value={challengeType}
                      onChange={(e) => setChallengeType(e.target.value as "daily" | "custom")}
                    >
                      <option value="daily">Daily</option>
                      <option value="custom">Custom</option>
                    </select>
                    <button type="submit">Publish Challenge</button>
                  </form>

                  <form className="card" onSubmit={uploadResponse}>
                    <h3>Upload Response</h3>
                    <select
                      aria-label="Challenge selection"
                      value={selectedChallengeId}
                      onChange={(e) => setSelectedChallengeId(e.target.value)}
                      required
                    >
                      <option value="">Select a challenge</option>
                      {challenges.map((challenge) => (
                        <option value={challenge._id} key={challenge._id}>
                          {challenge.prompt.slice(0, 45)}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Select response photo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSelectedPhoto(e.target.files?.[0] || null)}
                      required
                    />
                    <input
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Optional caption"
                    />
                    <label className="tiny">
                      <input
                        type="checkbox"
                        checked={encryptCaption}
                        onChange={(e) => setEncryptCaption(e.target.checked)}
                      />
                      Encrypt caption locally before upload
                    </label>
                    <button type="submit">Share Encrypted Photo</button>
                  </form>
                </div>

                <section>
                  <h3>Challenge Feed</h3>
                  {posts.map((post) => (
                    <article key={post._id} className="post">
                      <div className="post-head">
                        <strong>{post.author.displayName}</strong>
                        <span>{new Date(post.createdAt).toLocaleString()}</span>
                      </div>
                      {resolvedMediaUrls[post._id] ? (
                        <img alt="Challenge response" src={resolvedMediaUrls[post._id]} />
                      ) : (
                        <p className="tiny">Unable to decrypt media with local key.</p>
                      )}
                      <p>{resolvedCaptions[post._id] || ""}</p>
                      <div className="post-actions">
                        <button type="button" onClick={() => toggleLike(post._id)}>
                          {post.likes.includes(currentUser.id) ? "Unlike" : "Like"} ({post.likes.length})
                        </button>
                      </div>
                      <ul className="comments">
                        {post.comments.map((comment) => (
                          <li key={comment._id}>
                            <strong>{comment.displayName}: </strong>
                            <span>{resolvedComments[`${post._id}:${comment._id}`] || ""}</span>
                          </li>
                        ))}
                      </ul>
                      <form className="comment-form" onSubmit={(e) => addComment(e, post._id)}>
                        <input
                          value={commentDrafts[post._id] || ""}
                          onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post._id]: e.target.value }))}
                          placeholder="Leave an encrypted comment"
                        />
                        <button type="submit">Send</button>
                      </form>
                    </article>
                  ))}
                </section>
              </>
            )}

            {error ? <p className="error">{error}</p> : null}
          </section>
        </main>
      ) : null}
    </div>
  );
}
