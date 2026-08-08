import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "../config.service.js";
import { isIngestAuthorized } from "./ingest-auth.js";

@Injectable()
export class IngestAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") {
      return true;
    }

    const { ingestSecret } = this.configService.config;
    const request = context.switchToHttp().getRequest<Request>();
    if (!isIngestAuthorized(request.headers.authorization, ingestSecret)) {
      throw new UnauthorizedException("Invalid ingest credentials");
    }
    return true;
  }
}
