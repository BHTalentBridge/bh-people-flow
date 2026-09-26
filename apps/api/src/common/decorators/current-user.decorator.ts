import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user as AuthUser;
    return data ? user?.[data] : user;
  },
);
