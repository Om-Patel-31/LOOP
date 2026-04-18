import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/loop_app",
  uploadDir: process.env.UPLOAD_DIR || "uploads",
};
