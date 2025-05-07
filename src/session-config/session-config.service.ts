import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SetConfigDto } from './dto/set-config.dto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

interface UserConfig {
  userId: string;
  configs: { [key: string]: string };
}

@Injectable()
export class SessionConfigService implements OnModuleInit {
  private readonly logger = new Logger(SessionConfigService.name);
  private configs: { [userId: string]: { [key: string]: string } } = {};
  private readonly CONFIG_PATH = join(
    process.cwd(),
    'configs',
    'session-configs.json',
  );

  onModuleInit() {
    this.ensureConfigFileExists();
    this.loadConfigs();
  }

  private ensureConfigFileExists() {
    const dir = dirname(this.CONFIG_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.CONFIG_PATH)) {
      writeFileSync(this.CONFIG_PATH, JSON.stringify([], null, 2));
    }
  }

  private loadConfigs() {
    try {
      const data = readFileSync(this.CONFIG_PATH, 'utf8');
      const userConfigs: UserConfig[] = JSON.parse(data);

      // Convert array of user configs to our internal format
      this.configs = userConfigs.reduce(
        (acc, userConfig) => {
          if (userConfig && userConfig.userId) {
            acc[userConfig.userId] = userConfig.configs;
          }
          return acc;
        },
        {} as { [userId: string]: { [key: string]: string } },
      );

      this.logger.log('Session configs loaded successfully');
    } catch (error) {
      this.logger.error(`Failed to load session configs: ${error.message}`);
      this.configs = {};
    }
  }

  private saveConfigs() {
    try {
      // Convert our internal format to array of user configs
      const userConfigs: UserConfig[] = Object.entries(this.configs).map(
        ([userId, configs]) => ({
          userId,
          configs,
        }),
      );

      writeFileSync(this.CONFIG_PATH, JSON.stringify(userConfigs, null, 2));
      this.logger.log('Session configs saved successfully');
    } catch (error) {
      this.logger.error(`Failed to save session configs: ${error.message}`);
    }
  }

  setConfig(data: SetConfigDto): void {
    const { userId, configs } = data;

    if (!this.configs[userId]) {
      this.configs[userId] = {};
    }

    for (const config of configs) {
      this.configs[userId][config.key] = config.value;
      this.logger.log(`Set config ${config.key} for user ${userId}`);
    }

    this.saveConfigs();
  }

  getConfig(userId: string, key: string): string | undefined {
    const value = this.configs[userId]?.[key];
    console.log('🚀 ~ SessionConfigService ~ getConfig ~ value:', value);

    if (value === undefined) {
      this.logger.warn(`Config not found for user ${userId}, key ${key}`);
    } else {
      this.logger.debug(`Retrieved config for user ${userId}, key ${key}`);
    }

    return value;
  }

  getAllConfigs(userId: string): { [key: string]: string } | undefined {
    return this.configs[userId];
  }

  deleteConfig(userId: string, key: string): void {
    if (this.configs[userId]) {
      delete this.configs[userId][key];
      this.logger.log(`Deleted config ${key} for user ${userId}`);
      this.saveConfigs();
    }
  }

  deleteAllConfigs(userId: string): void {
    delete this.configs[userId];
    this.logger.log(`Deleted all configs for user ${userId}`);
    this.saveConfigs();
  }
}
