import { Module } from '@nestjs/common';
import { SessionConfigController } from './session-config.controller';
import { SessionConfigService } from './session-config.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [SessionConfigController],
  providers: [SessionConfigService],
})
export class SessionConfigModule {}
