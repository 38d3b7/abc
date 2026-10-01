import { lgeApi } from "./config";

export const createUser = async (walletAddress: string) =>
  await lgeApi.post("/users", { walletAddress });

export const getUser = async (walletAddress: string) =>
  await lgeApi.get(`/users/${walletAddress}`);
