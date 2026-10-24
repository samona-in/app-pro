import axios from 'axios';
import { getDeviceId } from './device-id';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  // The admin session is an HttpOnly cookie; every request must send it.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  // Used by the backend's login rate limiting (IP + phone + device).
  config.headers['x-device-id'] = getDeviceId();
  return config;
});

export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error?.message;
    if (typeof message === 'string' && message) return message;

    const retryAfter = error.response?.headers?.['retry-after'];
    if (error.response?.status === 429 && retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) {
        return `Too many failed attempts. Try again in ${formatDuration(seconds)}.`;
      }
    }
  }
  return fallback;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export default api;
