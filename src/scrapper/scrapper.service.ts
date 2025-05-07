import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import { Browser, BrowserContext, Page } from 'puppeteer';
import { SessionConfigService } from 'src/session-config/session-config.service';
import { GetPostsDto } from './dto/get-post.dto';
import { ScrapeTrackerService } from 'src/scrape-tracker/scrape-tracker.service';
import axios from 'axios';
import * as path from 'path';
import * as crypto from 'crypto';
import { existsSync, promises as fs } from 'fs';

puppeteer.use(StealthPlugin());

@Injectable()
export class ScrapperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScrapperService.name);
  private browser: Browser;
  private context: BrowserContext;
  private page: Page;
  private posts = {};
  private maxPostsAge = 0;
  private maxPostsFromGroup = 0;
  private groupsToProcess: string[] = [];
  private tooOldCount = 0;
  private nextGroup = false;
  private readonly IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
  private readonly userDataDir = path.join(process.cwd(), 'userData');

  constructor(
    private readonly sessionConfigService: SessionConfigService,
    private readonly trackerService: ScrapeTrackerService,
  ) {}

  async onModuleInit() {
    await this.initializeBrowser();
  }

  private async initializeBrowser() {
    try {
      if (!existsSync(this.userDataDir)) {
        await fs.mkdir(this.userDataDir, { recursive: true });
      }

      this.logger.log('Launching browser...');
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        userDataDir: this.userDataDir,
      });

      this.logger.log('Creating default browser context...');
      this.context = await this.browser.createBrowserContext();
      this.page = await this.context.newPage();
      this.logger.log('Default browser context created.');
    } catch (error) {
      this.logger.error(`Failed to initialize browser: ${error.message}`);
      throw error;
    }
  }

  private async ensureBrowserIsActive() {
    try {
      // Check if browser is still connected
      if (!this.browser?.isConnected()) {
        this.logger.log('Browser is not connected. Reinitializing...');
        await this.initializeBrowser();
      }

      // Check if page is still valid
      try {
        await this.page.evaluate(() => true);
      } catch (error) {
        this.logger.log('Page is not valid. Creating new page...');
        this.page = await this.context.newPage();
      }
    } catch (error) {
      this.logger.error(`Error ensuring browser is active: ${error.message}`);
      await this.initializeBrowser();
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  getPage(): Page {
    return this.page;
  }

  async startScrapping(
    data: GetPostsDto,
  ): Promise<{ status: boolean; message?: string; jobId?: string }> {
    const { userId } = data;

    // Check if scraping is already in progress for any user
    const currentStatus = this.trackerService.getStatus();
    if (currentStatus?.isProcessing) {
      return {
        status: false,
        message: `Scraping already in progress. Job ID: ${currentStatus.jobId}`,
      };
    }

    const c_user = this.sessionConfigService.getConfig(userId, 'c_user');
    const xs = this.sessionConfigService.getConfig(userId, 'xs');

    if (!c_user || !xs) {
      this.logger.error('User not found');
      return { status: false, message: 'User not found' };
    }

    try {
      await this.ensureBrowserIsActive();
      await this.setCookies(c_user, xs);

      const jobId = this.trackerService.start(userId, data.groups);

      // Run scraping in background
      this.scrapeInBackground(data).catch((err) => {
        this.logger.error(`Scraping failed: ${err.message}`);
        this.trackerService.complete(userId);
      });

      return {
        status: true,
        message: 'Scraping started successfully',
        jobId,
      };
    } catch (error) {
      this.logger.error(`Error during scraping: ${error.message}`);
      return {
        status: false,
        message: `Error during scraping: ${error.message}`,
      };
    }
  }

  private async downloadImage(url: string, saveDir: string): Promise<string> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      const extension = response.headers['content-type'].split('/')[1] || 'jpg';

      const filename = crypto.randomBytes(16).toString('hex') + '.' + extension;
      const fullPath = path.join(saveDir, filename);

      await fs.writeFile(fullPath, response.data);

      // Return the path you want to serve statically (e.g. via Express)
      return `/images/${filename}`;
    } catch (error) {
      console.error('Failed to download image:', url, error.message);
      return '';
    }
  }

  private async attachGraphQLResponseHandler() {
    this.page.on('response', async (response) => {
      if (
        response.url().includes('/api/graphql') &&
        response.request().method() === 'POST'
      ) {
        try {
          const text = await response.text();
          const lines = text.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            await this.processGraphQLPayload(JSON.parse(line));
          }
        } catch {}
      }
    });
  }

  private async processGraphQLPayload(data: any) {
    const timestamps = [];

    const creationTime = this.getPath(data, 'creation_time');
    if (creationTime) {
      const ts = creationTime * 1000;
      if (ts > this.maxPostsAge) {
        timestamps.push(ts);
        this.tooOldCount = 0;
      } else {
        this.tooOldCount++;
      }
    }

    const tracking = this.getPath(data, 'story.tracking');
    if (tracking) {
      const publishTime = this.getPath(JSON.parse(tracking), 'publish_time');
      if (publishTime && publishTime * 1000 > this.maxPostsAge) {
        timestamps.push(publishTime * 1000);
        this.tooOldCount = 0;
      } else {
        this.tooOldCount++;
      }
    }

    if (!timestamps.length) return;

    const timestamp = Math.max(...timestamps);
    const text = this.getPath(data, 'story.message.text');
    const nameData = this.getPath(data, 'owning_profile');
    const images = this.getPath(data, 'prefetch_uris_v2');
    const url = this.getPath(data, 'metadata.story.url');

    const groupID = url?.split('/')?.[4];
    const postID = url?.split('/')?.[6];

    if (!groupID || !postID || !this.groupsToProcess.includes(groupID)) return;

    const finalPost = {
      timestamp,
      date: new Date(timestamp).toISOString(),
      text,
      posterName: nameData?.name,
      posterID: nameData?.id,
      images: images?.map((img) => img.uri) || [],
      url,
      postID,
      groupID,
    };

    if (!this.posts[groupID]) this.posts[groupID] = {};
    this.posts[groupID][postID] = finalPost;

    if (Object.keys(this.posts[groupID]).length >= this.maxPostsFromGroup) {
      this.nextGroup = true;
    }
  }

  async setCookies(c_user: string, xs: string) {
    await this.page.setCookie(
      { name: 'c_user', value: c_user, domain: '.facebook.com' },
      { name: 'xs', value: xs, domain: '.facebook.com' },
    );
  }

  private async scrapeInBackground(data: GetPostsDto) {
    const { groups, maxPostsAge, maxPostsFromGroup, webHookUrl, userId } = data;

    try {
      this.posts = {};
      this.tooOldCount = 0;
      this.maxPostsAge = Date.now() - maxPostsAge * 60 * 60 * 1000;
      this.maxPostsFromGroup = maxPostsFromGroup;
      this.groupsToProcess = groups;

      await this.page.setRequestInterception(false);
      await this.attachGraphQLResponseHandler();

      for (const groupID of groups) {
        this.nextGroup = false;
        this.logger.log(`Scraping group: ${groupID}`);

        try {
          await this.page.goto(
            `https://www.facebook.com/groups/${groupID}/?sorting_setting=CHRONOLOGICAL`,
            { waitUntil: 'networkidle2' },
          );
        } catch (error) {
          this.logger.error(`Navigation failed for group ${groupID}: ${error}`);
          this.posts[groupID] = { error: 'Failed to load group page' };
          this.trackerService.updateGroupStatus(userId, groupID, {
            postCount: 0,
            imageCount: 0,
            error: 'Failed to load group page',
          });
          continue;
        }

        const groupExists = await this.page.$('rect ~ circle');
        if (groupExists) {
          this.posts[groupID] = { error: 'Group does not exist' };
          this.trackerService.updateGroupStatus(userId, groupID, {
            postCount: 0,
            imageCount: 0,
            error: 'Group does not exist',
          });
          continue;
        }

        const feed = await this.page.$('[role="feed"]');
        if (!feed) {
          this.posts[groupID] = { error: 'Not a member of this private group' };
          this.trackerService.updateGroupStatus(userId, groupID, {
            postCount: 0,
            imageCount: 0,
            error: 'Not a member of this private group',
          });
          continue;
        }

        try {
          await this.page.removeExposedFunction('noMorePosts');
        } catch (err) {
          this.logger.warn(
            `Failed to remove noMorePosts function: ${err.message}`,
          );
        }
        await this.page.exposeFunction('noMorePosts', () => {
          this.nextGroup = true;
        });

        await this.scrollUntilDone();

        // Update group status after scraping
        const groupPosts = this.posts[groupID] || {};
        const postCount = Object.keys(groupPosts).length;
        const imageCount = Object.values(groupPosts).reduce(
          (sum, post: any) => sum + (post.images?.length || 0),
          0,
        );

        this.trackerService.updateGroupStatus(userId, groupID, {
          postCount,
          imageCount: imageCount as number,
        });

        this.tooOldCount = 0;
      }

      await this.downloadAndSaveImages();

      for (const g of groups) {
        if (!this.posts[g] || !Object.keys(this.posts[g]).length) {
          this.posts[g] = {
            error: `No posts found in last ${this.maxPostsAge} hours`,
          };
        }
      }

      try {
        await axios.post(webHookUrl, {
          userId,
          data: this.posts,
        });
        this.logger.log(`✅ Sent data to webhook: ${webHookUrl}`);
      } catch (err) {
        this.logger.error(
          `❌ Failed to send data to webhook: ${webHookUrl} | ${err.message}`,
        );
      }
    } finally {
      // Cleanup resources
      try {
        if (this.page) {
          await this.page.close();
          this.page = null;
        }
        if (this.context) {
          await this.context.close();
          this.context = null;
        }
        if (this.browser) {
          await this.browser.close();
          this.browser = null;
        }
        this.logger.log('Browser resources cleaned up successfully');
      } catch (error) {
        this.logger.error(`Error during cleanup: ${error.message}`);
      }
      // Mark scraping as complete
      const session = this.trackerService.complete(userId);
      this.logger.log(`✅ Scraping completed for user ${userId}`);
      this.logger.log(`Total posts: ${session.totalPosts}`);
      this.logger.log(`Total images: ${session.totalImages}`);
    }
  }

  private getPath(obj: any, path: string): any {
    const keys = path.split('.');
    function search(current, i) {
      if (!current) return undefined;
      if (i === keys.length) return current;

      const key = keys[i];
      if (Array.isArray(current)) {
        for (const item of current) {
          const result = search(item, i);
          if (result !== undefined) return result;
        }
      } else if (typeof current === 'object') {
        if (key in current) {
          const result = search(current[key], i + 1);
          if (result !== undefined) return result;
        }
        for (const k in current) {
          const result = search(current[k], i);
          if (result !== undefined) return result;
        }
      }
      return undefined;
    }
    return search(obj, 0);
  }

  private async downloadAndSaveImages() {
    if (!existsSync(this.IMAGES_DIR)) {
      await fs.mkdir(this.IMAGES_DIR, { recursive: true });
    }

    for (const groupID of Object.keys(this.posts)) {
      if (this.posts[groupID]?.error) continue;

      for (const postID of Object.keys(this.posts[groupID])) {
        const post = this.posts[groupID][postID];
        if (!post.images?.length) continue;

        post.images = await Promise.all(
          post.images.map((url) => this.downloadImage(url, this.IMAGES_DIR)),
        );
      }
    }
  }

  private async scrollUntilDone() {
    await this.page.evaluate(() => {
      window.scrollRetries = 0;
      window.lastY = 0;
    });

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    await new Promise<void>(async (resolve) => {
      const scrollWithDelay = async () => {
        const result = await this.page.evaluate(async () => {
          const currentY = window.scrollY;

          // Get random scroll amount between 400 and 800 pixels (increased from 300-700)
          const scrollAmount = Math.floor(Math.random() * 400) + 400;

          window.scrollTo({
            top: currentY + scrollAmount,
            behavior: 'smooth',
          });

          if (currentY === window.lastY) {
            window.scrollRetries += 1;
          } else {
            window.scrollRetries = 0;
          }
          window.lastY = currentY;
          return {
            scrollRetries: window.scrollRetries,
            currentY: currentY,
          };
        });

        // Random delay between 0.5 and 1.5 seconds between scrolls (reduced from 1-3)
        const randomDelay = Math.floor(Math.random() * 1000) + 500;
        await sleep(randomDelay);

        // Occasionally pause for longer (15% chance instead of 20%)
        if (Math.random() < 0.15) {
          // Pause between 1-2 seconds (reduced from 2-5)
          await sleep(Math.floor(Math.random() * 1000) + 1000);
        }

        if (
          result.scrollRetries >= 5 ||
          this.nextGroup ||
          this.tooOldCount >= 10
        ) {
          resolve();
        } else {
          await scrollWithDelay();
        }
      };

      await scrollWithDelay();
    });
  }
}
