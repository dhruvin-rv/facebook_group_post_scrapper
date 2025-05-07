import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

interface ScrapeSession {
  isProcessing: boolean;
  startTime: Date;
  endTime?: Date;
  jobId: string;
  groups: {
    [groupId: string]: {
      status: 'completed' | 'failed' | 'pending';
      postCount: number;
      imageCount: number;
      error?: string;
    };
  };
  totalPosts: number;
  totalImages: number;
}

@Injectable()
export class ScrapeTrackerService {
  private readonly logger = new Logger(ScrapeTrackerService.name);
  private sessions: { [userId: string]: ScrapeSession } = {};

  start(userId: string, groupIds: string[]): string {
    const jobId = uuidv4();
    this.sessions[userId] = {
      isProcessing: true,
      startTime: new Date(),
      jobId,
      groups: groupIds.reduce(
        (acc, groupId) => ({
          ...acc,
          [groupId]: {
            status: 'pending',
            postCount: 0,
            imageCount: 0,
          },
        }),
        {},
      ),
      totalPosts: 0,
      totalImages: 0,
    };
    this.logger.log(`Started scraping job ${jobId} for user ${userId}`);
    return jobId;
  }

  updateGroupStatus(
    userId: string,
    groupId: string,
    data: { postCount: number; imageCount: number; error?: string },
  ) {
    if (!this.sessions[userId]) {
      this.logger.warn(`No active session found for user ${userId}`);
      return;
    }

    const session = this.sessions[userId];
    if (!session.groups[groupId]) {
      this.logger.warn(
        `Group ${groupId} not found in session for user ${userId}`,
      );
      return;
    }

    session.groups[groupId] = {
      status: data.error ? 'failed' : 'completed',
      postCount: data.postCount,
      imageCount: data.imageCount,
      error: data.error,
    };

    // Update totals
    session.totalPosts = Object.values(session.groups).reduce(
      (sum, group) => sum + group.postCount,
      0,
    );
    session.totalImages = Object.values(session.groups).reduce(
      (sum, group) => sum + group.imageCount,
      0,
    );

    this.logger.log(
      `Updated status for group ${groupId} in job ${session.jobId}`,
    );
  }

  complete(userId: string) {
    if (!this.sessions[userId]) {
      this.logger.warn(`No active session found for user ${userId}`);
      return;
    }

    const session = this.sessions[userId];
    session.isProcessing = false;
    session.endTime = new Date();

    this.logger.log(
      `Completed scraping job ${session.jobId} for user ${userId}`,
    );
    this.logger.log(
      `Total posts: ${session.totalPosts}, Total images: ${session.totalImages}`,
    );

    // Log group-wise summary
    Object.entries(session.groups).forEach(([groupId, data]) => {
      this.logger.log(
        `Group ${groupId}: ${data.status}, Posts: ${data.postCount}, Images: ${data.imageCount}`,
      );
      if (data.error) {
        this.logger.error(`Group ${groupId} error: ${data.error}`);
      }
    });

    return session;
  }

  getStatus() {
    return Object.values(this.sessions).find((session) => session.isProcessing);
  }

  getJobStatus(jobId: string) {
    return Object.values(this.sessions).find(
      (session) => session.jobId === jobId,
    );
  }
}
