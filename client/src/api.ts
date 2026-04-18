import axios from "axios";
import { AuthKeyBundle, AuthUser } from "./types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
  withCredentials: true,
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
  authKeyBundle: AuthKeyBundle;
};

export async function register(payload: {
  email: string;
  password: string;
  displayName: string;
  authKeyBundle: AuthKeyBundle;
}) {
  const response = await api.post<AuthResponse>("/auth/register", payload);
  return response.data;
}

export async function login(payload: { email: string; password: string }) {
  const response = await api.post<AuthResponse>("/auth/login", payload);
  return response.data;
}

export async function refresh() {
  const response = await api.post<AuthResponse>("/auth/refresh");
  return response.data;
}

export async function me() {
  const response = await api.get<{ user: AuthUser; authKeyBundle: AuthKeyBundle }>("/auth/me");
  return response.data;
}

export async function logout() {
  await api.post("/auth/logout");
}

export default api;
