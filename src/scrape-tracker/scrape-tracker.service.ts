import { Injectable } from '@nestjs/common';

interface ScrapeStatus {
  userId: string;
  isProcessing: boolean;
  startedAt: number;
  completedAt?: number;
}

@Injectable()
export class ScrapeTrackerService {
  private statusMap: Map<string, ScrapeStatus> = new Map();

  start(userId: string) {
    this.statusMap.set(userId, {
      userId,
      isProcessing: true,
      startedAt: Date.now(),
    });
  }

  complete(userId: string) {
    const status = this.statusMap.get(userId);
    if (status) {
      status.isProcessing = false;
      status.completedAt = Date.now();
      this.statusMap.set(userId, status);
    }
  }

  getStatus(userId: string): ScrapeStatus | undefined {
    return this.statusMap.get(userId);
  }
}
