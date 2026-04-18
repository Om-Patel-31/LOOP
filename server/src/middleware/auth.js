export function mockAuth(req, _res, next) {
  const userId = req.header("x-user-id") || "demo-user";
  const displayName = req.header("x-user-name") || "Demo User";

  req.user = {
    userId,
    displayName,
  };

  next();
}
