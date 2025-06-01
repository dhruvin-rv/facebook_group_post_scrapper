import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SetConfigDto } from './dto/set-config.dto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { ProxyConfig } from './dto/proxy-config.dto';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

interface UserConfig {
  userId: string;
  configs: { [key: string]: string };
  proxy?: ProxyConfig;
}

interface ConfigStore {
  [userId: string]: {
    configs: { [key: string]: string };
    proxy?: ProxyConfig;
  };
}

@Injectable()
export class SessionConfigService implements OnModuleInit {
  private readonly logger = new Logger(SessionConfigService.name);
  private configs: ConfigStore = {};
  private readonly CONFIG_PATH = join(
    process.cwd(),
    'configs',
    'session-configs.json',
  );
  private readonly PROXY_API_URL = 'https://gw.dataimpulse.com:777/api/list';
  private readonly PROXY_USERNAME: string;
  private readonly PROXY_PASSWORD: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.PROXY_USERNAME = this.configService.get<string>('PROXY_USERNAME');
    this.PROXY_PASSWORD = this.configService.get<string>('PROXY_PASSWORD');

    // Log proxy configuration status
    if (!this.PROXY_USERNAME || !this.PROXY_PASSWORD) {
      this.logger.error(
        'Proxy authentication credentials are missing in environment variables. Please set PROXY_USERNAME and PROXY_PASSWORD.',
      );
    } else {
      this.logger.log('Proxy authentication credentials loaded successfully');
    }
  }

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

      this.configs = userConfigs.reduce((acc, userConfig) => {
        if (userConfig && userConfig.userId) {
          acc[userConfig.userId] = {
            configs: userConfig.configs,
            proxy: userConfig.proxy,
          };
        }
        return acc;
      }, {} as ConfigStore);

      this.logger.log('Session configs loaded successfully');
    } catch (error) {
      this.logger.error(`Failed to load session configs: ${error.message}`);
      this.configs = {};
    }
  }

  private saveConfigs() {
    try {
      const userConfigs: UserConfig[] = Object.entries(this.configs).map(
        ([userId, data]) => ({
          userId,
          configs: data.configs,
          proxy: data.proxy,
        }),
      );

      writeFileSync(this.CONFIG_PATH, JSON.stringify(userConfigs, null, 2));
      this.logger.log('Session configs saved successfully');
    } catch (error) {
      this.logger.error(`Failed to save session configs: ${error.message}`);
    }
  }

  async setConfig(data: SetConfigDto): Promise<void> {
    const { userId, configs } = data;

    if (!this.configs[userId]) {
      this.configs[userId] = { configs: {} };
    }

    for (const config of configs) {
      this.configs[userId].configs[config.key] = config.value;
      this.logger.log(`Set config ${config.key} for user ${userId}`);
    }

    // Generate proxy if not exists and need to use proxy
    console.log(
      '🚀 ~ SessionConfigService ~ setConfig ~ data.useProxy:',
      data.useProxy,
    );
    if (!this.configs[userId].proxy && data.useProxy) {
      try {
        await this.generateProxy(userId);
        this.logger.log(`Generated and assigned new proxy for user ${userId}`);
      } catch (error) {
        this.logger.error(
          `Failed to generate proxy for user ${userId}: ${error.message}`,
        );
      }
    }

    this.saveConfigs();
  }

  getConfig(userId: string, key: string): string | undefined {
    this.loadConfigs();
    return this.configs[userId]?.configs[key];
  }

  getAllConfigs(userId: string): { [key: string]: string } | undefined {
    this.loadConfigs();
    return this.configs[userId]?.configs;
  }

  deleteConfig(userId: string, key: string): void {
    this.loadConfigs();
    if (this.configs[userId]) {
      delete this.configs[userId].configs[key];
      this.logger.log(`Deleted config ${key} for user ${userId}`);
      this.saveConfigs();
    }
  }

  deleteAllConfigs(userId: string): void {
    this.loadConfigs();
    delete this.configs[userId];
    this.logger.log(`Deleted all configs for user ${userId}`);
    this.saveConfigs();
  }

  private validateProxyFormat(proxy: string): boolean {
    try {
      // Check if proxy string matches expected format
      const proxyRegex = /^[^@]+__[^@]+@[^:]+:\d+$/;
      if (!proxyRegex.test(proxy)) {
        return false;
      }

      // Try parsing as URL to validate further
      new URL(`http://${proxy}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  async generateProxy(userId: string): Promise<string> {
    try {
      if (!this.PROXY_USERNAME || !this.PROXY_PASSWORD) {
        throw new Error(
          'Proxy authentication credentials not configured. Please set PROXY_USERNAME and PROXY_PASSWORD environment variables.',
        );
      }

      const auth = Buffer.from(
        `${this.PROXY_USERNAME}:${this.PROXY_PASSWORD}`,
      ).toString('base64');

      this.logger.debug(`Generating proxy for user ${userId}...`);

      const proxyCount = Object.keys(this.configs).length
        ? Object.keys(this.configs).length
        : 1;

      const response = await firstValueFrom(
        this.httpService.get<string>(
          `${this.PROXY_API_URL}?countries=il&type=sticky&protocol=http&quantity=${proxyCount}`,
          {
            headers: {
              Authorization: `Basic ${auth}`,
            },
          },
        ),
      );

      const proxy = response.data.split('\n')[proxyCount - 1].trim();

      if (!this.validateProxyFormat(proxy)) {
        throw new Error('Invalid proxy format received from proxy service');
      }

      if (!this.configs[userId]) {
        this.configs[userId] = { configs: {} };
      }

      const proxyConfig: ProxyConfig = {
        proxy,
        lastUpdated: new Date(),
      };

      this.configs[userId] = {
        configs: this.configs[userId].configs,
        proxy: proxyConfig,
      };

      this.saveConfigs();
      this.logger.log(`Generated new proxy for user ${userId}`);
      return proxy;
    } catch (error) {
      this.logger.error(
        `Failed to generate proxy for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  getProxy(userId: string): ProxyConfig | undefined {
    return this.configs[userId]?.proxy;
  }
}
