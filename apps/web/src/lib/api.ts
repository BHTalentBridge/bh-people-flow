import axios from 'axios';
import { toast } from 'sonner';

export const TOKEN_KEY = 'sh-token';

/**
 * Same-origin `/api` by default, which is what the Vite dev proxy serves and
 * what a single-origin deployment needs. `VITE_API_URL` overrides it with an
 * absolute URL when the frontend is hosted separately from the API.
 */
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error.response?.status;
    const message = extractMessage(error);

    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      if (location.pathname !== '/login') location.assign('/login');
    }
    return Promise.reject(Object.assign(error, { friendlyMessage: message }));
  },
);

export function extractMessage(error: unknown): string {
  const anyErr = error as any;
  const data = anyErr?.response?.data;
  if (!data) return anyErr?.message ?? 'Something went wrong.';
  if (Array.isArray(data.message)) return data.message[0];
  return data.message ?? 'Something went wrong.';
}

/** Toasts the API's own error copy — server messages are already user-facing. */
export function toastError(error: unknown) {
  toast.error(extractMessage(error));
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
