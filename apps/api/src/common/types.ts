import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Present only for RESOURCE users (and any user with a resource profile). */
  resourceId: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
