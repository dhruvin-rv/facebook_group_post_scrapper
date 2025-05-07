import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

interface UserConfig {
  userId: string;
  config: Record<string, string>;
}

const CONFIG_PATH = join(__dirname, '../../configs/session-configs.json');

@Injectable()
export class SessionConfigService implements OnModuleInit, OnModuleDestroy {
  private userConfigs: UserConfig[] = [];

  onModuleInit() {
    this.ensureConfigFileExists();

    try {
      const data = readFileSync(CONFIG_PATH, 'utf8');
      this.userConfigs = JSON.parse(data);
    } catch (error) {
      console.error('Failed to load session config:', error);
    }
  }

  onModuleDestroy() {
    this.saveToFile();
  }

  setConfig(userId: string, key: string, value: string): void {
    let userConfig = this.userConfigs.find((u) => u.userId === userId);

    if (!userConfig) {
      userConfig = { userId, config: {} };
      this.userConfigs.push(userConfig);
    }

    userConfig.config[key] = value;
    this.saveToFile(); // Optional: persist on every update
  }

  getConfig(userId: string, key: string): string | null {
    const userConfig = this.userConfigs.find((u) => u.userId === userId);
    return userConfig?.config[key] ?? null;
  }

  getAllConfig(userId: string): Record<string, string> | null {
    return this.userConfigs.find((u) => u.userId === userId)?.config ?? null;
  }

  private saveToFile() {
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(this.userConfigs, null, 2));
    } catch (error) {
      console.error('Failed to save session config:', error);
    }
  }

  private ensureConfigFileExists() {
    const dir = dirname(CONFIG_PATH);

    // Create folder if it doesn't exist
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Create empty file if it doesn't exist
    if (!existsSync(CONFIG_PATH)) {
      writeFileSync(CONFIG_PATH, '[]');
    }
  }
}
