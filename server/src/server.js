import { startServer } from "./app.js";

startServer().catch((error) => {
  console.error("Failed to start Loop API", error);
  process.exit(1);
});
