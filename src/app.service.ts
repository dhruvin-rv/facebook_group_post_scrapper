import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as path from 'path';
import { existsSync, promises as fs } from 'fs';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly logger = new Logger(AppService.name);
  private readonly IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
  private readonly IMAGE_RETENTION_HOURS = 24;

  async onModuleInit() {
    await this.cleanupOldImages();
    // Set up periodic cleanup every hour
    setInterval(() => this.cleanupOldImages(), 60 * 60 * 1000);
  }

  private async cleanupOldImages() {
    try {
      if (!existsSync(this.IMAGES_DIR)) {
        return;
      }

      const files = await fs.readdir(this.IMAGES_DIR);
      const now = Date.now();
      const retentionTime = this.IMAGE_RETENTION_HOURS * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.IMAGES_DIR, file);
        const stats = await fs.stat(filePath);

        // Check if file is older than retention period
        if (now - stats.mtimeMs > retentionTime) {
          await fs.unlink(filePath);
          this.logger.log(`Deleted old image: ${file}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error cleaning up old images: ${error.message}`);
    }
  }

  getHello(): string {
    return 'Hello World!';
  }
}
