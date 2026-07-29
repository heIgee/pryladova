import { Injectable } from "@nestjs/common";
import type { ApiConfig } from "./config.js";
import { loadConfig } from "./config.js";

@Injectable()
export class ConfigService {
  readonly config: ApiConfig = loadConfig();
}
