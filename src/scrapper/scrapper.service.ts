import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
import { Browser, BrowserContext, LaunchOptions, Page } from 'puppeteer';
import { SessionConfigService } from 'src/session-config/session-config.service';
import { GetPostsDto } from './dto/get-post.dto';
import { ScrapeTrackerService } from 'src/scrape-tracker/scrape-tracker.service';
import axios from 'axios';
import * as path from 'path';
import * as crypto from 'crypto';
import { existsSync, promises as fs } from 'fs';
import { ConfigService } from '@nestjs/config';

puppeteer.use(StealthPlugin());

@Injectable()
export class ScrapperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScrapperService.name);
  private activeJobs: Map<
    string,
    {
      browser: Browser;
      context: BrowserContext;
      page: Page;
      posts: Record<string, any>;
      tooOldCount: number;
      nextGroup: boolean;
    }
  > = new Map();
  private maxPostsAge = 0;
  private maxPostsFromGroup = 0;
  private groupsToProcess: string[] = [];
  private readonly IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
  private readonly NODE_ENV: string = 'development';
  private readonly IS_PRODUCTION: boolean = false;
  private userDataDir: string;

  constructor(
    private readonly sessionConfigService: SessionConfigService,
    private readonly trackerService: ScrapeTrackerService,
    private readonly configService: ConfigService,
  ) {
    this.NODE_ENV = this.configService.get<string>('NODE_ENV') || 'development';
    this.IS_PRODUCTION = this.NODE_ENV === 'production';
    this.logger.log(`Environment: ${this.NODE_ENV}`);
  }

  async onModuleInit() {
    // No need to initialize browser here anymore
  }

  async onModuleDestroy() {
    // Close all active browser instances
    for (const [userId] of this.activeJobs.entries()) {
      try {
        await this.cleanupJobResources(userId);
      } catch (error) {
        this.logger.error(
          `Error cleaning up job for user ${userId}: ${error.message}`,
        );
      }
    }
  }

  private async initializeBrowserForJob(userId: string): Promise<{
    browser: Browser;
    context: BrowserContext;
    page: Page;
  }> {
    const executablePath = this.configService.get<string>('CHROMIUM_PATH');
    this.userDataDir = this.IS_PRODUCTION
      ? this.configService.get<string>('USER_DATA_DIR')
      : path.join(process.cwd(), 'userData', userId);

    try {
      if (!existsSync(this.userDataDir)) {
        await fs.mkdir(this.userDataDir, { recursive: true });
      }

      const launchOptions: LaunchOptions = {
        args: [
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
          '--disable-features=site-per-process',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-sync',
          '--window-size=1920,1080',
        ],
        defaultViewport: { width: 1920, height: 1080 },
        userDataDir: this.userDataDir,
        headless: this.IS_PRODUCTION,
      };

      let username = '';
      let password = '';

      const useProxy = this.sessionConfigService.getConfig(userId, 'useProxy');

      if (useProxy) {
        const proxyConfig = this.sessionConfigService.getProxy(userId);
        if (!proxyConfig) {
          throw new Error(
            'No proxy configuration found. Please set up user configuration first.',
          );
        }

        this.logger.log(`Launching browser for user ${userId} with proxy...`);

        // Parse proxy URL properly
        const proxyUrl = new URL(`http://${proxyConfig.proxy}`);
        const proxyHost = proxyUrl.hostname;
        const proxyPort = proxyUrl.port;
        username = proxyUrl.username;
        password = proxyUrl.password;

        this.logger.debug(`Configuring proxy: ${proxyHost}:${proxyPort}`);

        launchOptions.args.push(`--proxy-server=${proxyHost}:${proxyPort}`);
      }

      if (this.IS_PRODUCTION && executablePath) {
        launchOptions.executablePath = executablePath;
      }

      const browser = await puppeteer.launch(launchOptions);
      const context = await browser.createBrowserContext();
      const page = await context.newPage();

      if (useProxy) {
        await page.authenticate({
          username,
          password,
        });
      }

      await page.setRequestInterception(true);

      page.on('request', (req) => {
        const blockedResourceTypes = ['image', 'media'];
        const url = req.url();

        // Block requests for specified resource types or common ad tracking URLs
        if (
          blockedResourceTypes.includes(req.resourceType()) ||
          url.includes('google-analytics') ||
          url.includes('doubleclick') ||
          url.includes('facebook.com/tr/') // tracking pixel
        ) {
          return req.abort();
        }

        return req.continue();
      });

      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      );

      await page.setExtraHTTPHeaders({
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        Connection: 'keep-alive',
        'Accept-Encoding': 'gzip, deflate, br',
      });

      // Initialize job-specific data
      this.activeJobs.set(userId, {
        browser,
        context,
        page,
        posts: {},
        tooOldCount: 0,
        nextGroup: false,
      });

      return { browser, context, page };
    } catch (error) {
      this.logger.error(
        `Failed to initialize browser for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  private async cleanupJobResources(userId: string) {
    const job = this.activeJobs.get(userId);
    if (job) {
      try {
        if (job.page) await job.page.close();
        if (job.context) await job.context.close();
        if (job.browser) await job.browser.close();
        // Clear job data
        this.activeJobs.delete(userId);
        this.logger.log(`Cleaned up resources for user ${userId}`);
      } catch (error) {
        this.logger.error(
          `Error cleaning up resources for user ${userId}: ${error.message}`,
        );
      }
    }
  }

  async startScrapping(
    data: GetPostsDto,
  ): Promise<{ status: boolean; message?: string; jobId?: string }> {
    const { userId } = data;
    this.logger.debug(`Starting scraping for user ${userId}`);

    // Check if user already has an active job
    if (this.activeJobs.has(userId)) {
      return {
        status: false,
        message: `User ${userId} already has an active scraping job`,
      };
    }

    this.logger.debug('Retrieving session configs...');
    const c_user = this.sessionConfigService.getConfig(userId, 'c_user');
    const xs = this.sessionConfigService.getConfig(userId, 'xs');

    if (!c_user || !xs) {
      this.logger.error(
        `User not found or missing credentials for user ${userId}`,
      );
      this.logger.error(`c_user: ${c_user}, xs: ${xs}`);
      return {
        status: false,
        message: 'User not found or missing credentials',
      };
    }

    try {
      const { page } = await this.initializeBrowserForJob(userId);
      await this.setCookies(page, c_user, xs);

      const jobId = this.trackerService.start(userId, data.groups);

      // Run scraping in background
      this.scrapeInBackground(data, page).catch((err) => {
        this.logger.error(`Scraping failed for user ${userId}: ${err.message}`);
        this.trackerService.complete(userId);
        this.cleanupJobResources(userId);
      });

      return {
        status: true,
        message: 'Scraping started successfully',
        jobId,
      };
    } catch (error) {
      this.logger.error(`Error during scraping: ${error.message}`);
      await this.cleanupJobResources(userId);
      return {
        status: false,
        message: `Error during scraping: ${error.message}`,
      };
    }
  }

  private async setCookies(page: Page, c_user: string, xs: string) {
    await page.setCookie(
      { name: 'c_user', value: c_user, domain: '.facebook.com' },
      { name: 'xs', value: xs, domain: '.facebook.com' },
    );
  }

  private async navigateToGroup(
    page: Page,
    groupID: string,
  ): Promise<{
    success: boolean;
    error?: string;
    details?: string;
  }> {
    try {
      const response = await Promise.race([
        page.goto(
          `https://www.facebook.com/groups/${groupID}/?sorting_setting=CHRONOLOGICAL`,
          {
            waitUntil: 'networkidle2',
            timeout: 60000, // 60 seconds timeout
          },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Navigation timeout')), 60000),
        ),
      ]);

      if (!response) {
        return {
          success: false,
          error: 'Failed to load group page',
          details: 'Navigation timeout or no response received',
        };
      }

      if (response.status() >= 400) {
        return {
          success: false,
          error: 'Failed to load group page',
          details: `HTTP status: ${response.status()} - ${response.statusText()}`,
        };
      }

      // Check for specific error indicators on the page
      const errorIndicators = await Promise.all([
        page.$('rect ~ circle'), // Group doesn't exist
        page.$('[role="feed"]'), // Not a member
      ]);

      if (errorIndicators[0]) {
        return {
          success: false,
          error: 'Group does not exist',
          details: 'Found group non-existence indicator on page',
        };
      }

      if (!errorIndicators[1]) {
        return {
          success: false,
          error: 'Not a member of this private group',
          details: 'Feed element not found on page',
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: 'Navigation failed',
        details: error.message || 'Unknown error occurred during navigation',
      };
    }
  }

  private async scrapeInBackground(data: GetPostsDto, page: Page) {
    const { groups, maxPostsAge, maxPostsFromGroup, webHookUrl, userId } = data;
    const job = this.activeJobs.get(userId);
    if (!job) {
      throw new Error(`No active job found for user ${userId}`);
    }

    try {
      this.maxPostsAge = Date.now() - maxPostsAge * 60 * 60 * 1000;
      this.maxPostsFromGroup = maxPostsFromGroup;
      this.groupsToProcess = groups;

      await this.attachGraphQLResponseHandler(page);

      for (const groupID of groups) {
        job.nextGroup = false;
        this.logger.log(`Scraping group: ${groupID}`);

        const navigationResult = await this.navigateToGroup(page, groupID);

        if (!navigationResult.success) {
          this.logger.error(
            `Navigation failed for group ${groupID}: ${navigationResult.error} - ${navigationResult.details}`,
          );
          job.posts[groupID] = {
            error: navigationResult.error,
            details: navigationResult.details,
          };
          this.trackerService.updateGroupStatus(userId, groupID, {
            postCount: 0,
            imageCount: 0,
            error: `${navigationResult.error}: ${navigationResult.details}`,
          });
          continue;
        }

        try {
          await page.removeExposedFunction('noMorePosts');
        } catch (err) {
          this.logger.warn(
            `Failed to remove noMorePosts function: ${err.message}`,
          );
        }
        await page.exposeFunction('noMorePosts', () => {
          job.nextGroup = true;
        });

        await this.scrollUntilDone(page, job);

        // Update group status after scraping
        const groupPosts = job.posts[groupID] || {};
        const postCount = Object.keys(groupPosts).length;
        const imageCount = Object.values(groupPosts).reduce(
          (sum, post: any) => sum + (post.images?.length || 0),
          0,
        );

        this.trackerService.updateGroupStatus(userId, groupID, {
          postCount,
          imageCount: imageCount as number,
        });

        job.tooOldCount = 0;
      }

      await this.downloadAndSaveImages(job.posts);

      for (const g of groups) {
        if (!job.posts[g] || !Object.keys(job.posts[g]).length) {
          job.posts[g] = {
            error: `No posts found in last ${this.maxPostsAge} hours`,
          };
        }
      }

      try {
        await axios.post(webHookUrl, {
          userId,
          data: job.posts,
          status: 'success',
          jobId: this.trackerService.getJobId(userId),
          completedAt: new Date().toISOString(),
          stats: {
            totalGroups: groups.length,
            completedGroups: Object.keys(job.posts).length,
            totalPosts: Object.values(job.posts).reduce(
              (sum, group: any) => sum + Object.keys(group).length,
              0,
            ),
            totalImages: Object.values(job.posts).reduce(
              (sum, group: any) =>
                sum +
                Object.values(group).reduce(
                  (groupSum: number, post: any) =>
                    groupSum + (post.images?.length || 0),
                  0,
                ),
              0,
            ),
          },
        });
        this.logger.log(`✅ Sent data to webhook: ${webHookUrl}`);
      } catch (err) {
        this.logger.error(
          `❌ Failed to send data to webhook: ${webHookUrl} | ${err.message}`,
        );
      }
    } catch (error) {
      // Send failure notification to webhook
      try {
        const failureData = {
          userId,
          status: 'failed',
          jobId: this.trackerService.getJobId(userId),
          error: {
            message: error.message,
            type: error.name,
            stack: error.stack,
            timestamp: new Date().toISOString(),
          },
          context: {
            groups: groups,
            maxPostsAge,
            maxPostsFromGroup,
            completedGroups: Object.keys(job.posts).length,
            partialData: job.posts,
          },
          stats: {
            totalGroups: groups.length,
            completedGroups: Object.keys(job.posts).length,
            totalPosts: Object.values(job.posts).reduce(
              (sum, group: any) => sum + Object.keys(group).length,
              0,
            ),
            totalImages: Object.values(job.posts).reduce(
              (sum, group: any) =>
                sum +
                Object.values(group).reduce(
                  (groupSum: number, post: any) =>
                    groupSum + (post.images?.length || 0),
                  0,
                ),
              0,
            ),
          },
        };

        await axios.post(webHookUrl, failureData);
        this.logger.error(
          `❌ Sent failure notification to webhook: ${webHookUrl}`,
        );
      } catch (webhookError) {
        this.logger.error(
          `❌ Failed to send failure notification to webhook: ${webHookUrl} | ${webhookError.message}`,
        );
      }
    } finally {
      await this.cleanupJobResources(userId);
      const session = this.trackerService.complete(userId);
      this.logger.log(`✅ Scraping completed for user ${userId}`);
      this.logger.log(`Total posts: ${session.totalPosts}`);
      this.logger.log(`Total images: ${session.totalImages}`);
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

  private async attachGraphQLResponseHandler(page: Page) {
    const userId = Array.from(this.activeJobs.entries()).find(
      ([, job]) => job.page === page,
    )?.[0];

    if (!userId) {
      throw new Error('No job found for this page');
    }

    page.on('response', async (response) => {
      if (
        response.url().includes('/api/graphql') &&
        response.request().method() === 'POST'
      ) {
        try {
          const text = await response.text();
          const lines = text.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            await this.processGraphQLPayload(JSON.parse(line), userId);
          }
        } catch {}
      }
    });
  }

  private async processGraphQLPayload(data: any, userId: string) {
    const job = this.activeJobs.get(userId);
    if (!job) {
      throw new Error(`No active job found for user ${userId}`);
    }

    const timestamps = [];

    const creationTime = this.getPath(data, 'creation_time');
    if (creationTime) {
      const ts = creationTime * 1000;
      if (ts > this.maxPostsAge) {
        timestamps.push(ts);
        job.tooOldCount = 0;
      } else {
        job.tooOldCount++;
      }
    }

    const tracking = this.getPath(data, 'story.tracking');
    if (tracking) {
      const publishTime = this.getPath(JSON.parse(tracking), 'publish_time');
      if (publishTime && publishTime * 1000 > this.maxPostsAge) {
        timestamps.push(publishTime * 1000);
        job.tooOldCount = 0;
      } else {
        job.tooOldCount++;
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

    if (!job.posts[groupID]) job.posts[groupID] = {};
    job.posts[groupID][postID] = finalPost;

    if (Object.keys(job.posts[groupID]).length >= this.maxPostsFromGroup) {
      job.nextGroup = true;
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

  private async downloadAndSaveImages(posts: Record<string, any>) {
    if (!existsSync(this.IMAGES_DIR)) {
      await fs.mkdir(this.IMAGES_DIR, { recursive: true });
    }

    for (const groupID of Object.keys(posts)) {
      if (posts[groupID]?.error) continue;

      for (const postID of Object.keys(posts[groupID])) {
        const post = posts[groupID][postID];
        if (!post.images?.length) continue;

        post.images = await Promise.all(
          post.images.map((url) => this.downloadImage(url, this.IMAGES_DIR)),
        );
      }
    }
  }

  private async scrollUntilDone(
    page: Page,
    job: { nextGroup: boolean; tooOldCount: number },
  ) {
    await page.evaluate(() => {
      window.scrollRetries = 0;
      window.lastY = 0;
    });

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    await new Promise<void>(async (resolve) => {
      const scrollWithDelay = async () => {
        const result = await page.evaluate(async () => {
          const currentY = window.scrollY;

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

        const randomDelay = Math.floor(Math.random() * 1000) + 500;
        await sleep(randomDelay);

        if (Math.random() < 0.15) {
          await sleep(Math.floor(Math.random() * 1000) + 1000);
        }

        if (
          result.scrollRetries >= 5 ||
          job.nextGroup ||
          job.tooOldCount >= 10
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
