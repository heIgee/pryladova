import { timingSafeEqual } from "node:crypto";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { loadConfig } from "../config.js";

const bearerPrefix = "Bearer ";

const secretsEqual = (provided: string, expected: string): boolean => {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
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
  canActivate(context: ExecutionContext): boolean {
    const { ingestSecret } = loadConfig();
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
