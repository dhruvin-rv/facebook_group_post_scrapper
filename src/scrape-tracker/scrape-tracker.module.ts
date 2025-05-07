import { Module } from '@nestjs/common';
import { ScrapeTrackerService } from './scrape-tracker.service';

@Module({
  providers: [ScrapeTrackerService],
})
export class ScrapeTrackerModule {}
