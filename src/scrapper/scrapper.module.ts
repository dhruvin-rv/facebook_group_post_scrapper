import { Module } from '@nestjs/common';
import { ScrapperController } from './scrapper.controller';
import { ScrapperService } from './scrapper.service';
import { SessionConfigService } from 'src/session-config/session-config.service';
import { ScrapeTrackerService } from 'src/scrape-tracker/scrape-tracker.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [ScrapperController],
  providers: [ScrapperService, SessionConfigService, ScrapeTrackerService],
})
export class ScrapperModule {}
