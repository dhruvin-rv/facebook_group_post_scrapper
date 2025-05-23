import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScrapperModule } from './scrapper/scrapper.module';
import { SessionConfigModule } from './session-config/session-config.module';
import { ScrapeTrackerModule } from './scrape-tracker/scrape-tracker.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/static',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScrapperModule,
    SessionConfigModule,
    ScrapeTrackerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
