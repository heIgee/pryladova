import { Injectable } from "@nestjs/common";
import type { Settings } from "@pryladova/shared";

@Injectable()
export class SettingsService {
  private classificationEnabled = true;

  getSettings(): Settings {
    return { classificationEnabled: this.classificationEnabled };
  }

  setSettings(settings: Settings): Settings {
    if (settings.classificationEnabled !== this.classificationEnabled) {
      console.log(
        `[api] classification ${settings.classificationEnabled ? "enabled" : "disabled"}`,
      );
    }
    this.classificationEnabled = settings.classificationEnabled;
    return this.getSettings();
  }

  isClassificationEnabled(): boolean {
    return this.classificationEnabled;
  }
}
