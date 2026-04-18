import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/loop_app",
  nodeEnv: process.env.NODE_ENV || "development",
  appOrigin: process.env.APP_ORIGIN || "http://localhost:5173",
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || "15m",
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || "7d",
  storageProvider: process.env.STORAGE_PROVIDER || "memory",
  storageBucket: process.env.STORAGE_BUCKET || "loop-dev-bucket",
  awsRegion: process.env.AWS_REGION || "us-east-1",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  gcsProjectId: process.env.GCS_PROJECT_ID,
  gcsKeyFile: process.env.GCS_KEY_FILE,
};
