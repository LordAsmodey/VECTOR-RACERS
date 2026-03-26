import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthTokensService } from '../auth.tokens.service';

export interface AuthenticatedUserContext {
  userId: string;
}

@Injectable()
export class JwtStrategy {
  constructor(private readonly authTokensService: AuthTokensService) {}

  validateAccessToken(token: string): AuthenticatedUserContext {
    const payload = this.authTokensService.verifyAccessToken(token);

    if (!payload.sub) {
      throw new UnauthorizedException('Invalid access token');
    }

    return { userId: payload.sub };
  }
}
