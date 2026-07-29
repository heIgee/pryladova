import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "../config.service.js";

const bearerPrefix = "Bearer ";

// HMAC digests are fixed-length, so timingSafeEqual never observes input length.
const secretsEqual = (provided: string, expected: string): boolean => {
  const digest = (value: string) => createHmac("sha256", expected).update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
};

const readBearerToken = (authorization: string | undefined): string | undefined => {
  if (!authorization?.startsWith(bearerPrefix)) {
    return undefined;
  }
  const token = authorization.slice(bearerPrefix.length).trim();
  return token.length > 0 ? token : undefined;
};

@Injectable()
export class IngestAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const { ingestSecret } = this.configService.config;
    if (!ingestSecret) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = readBearerToken(request.headers.authorization);
    if (!token || !secretsEqual(token, ingestSecret)) {
      throw new UnauthorizedException("Invalid ingest credentials");
    }
    return true;
  }
}
