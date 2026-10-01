import axios from "axios";
import { LGE_API_URL } from "../../config/const";

export const lgeApi = axios.create({
  baseURL: LGE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});
