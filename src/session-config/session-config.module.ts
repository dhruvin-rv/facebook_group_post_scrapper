import { Module } from '@nestjs/common';
import { SessionConfigController } from './session-config.controller';
import { SessionConfigService } from './session-config.service';

@Module({
  controllers: [SessionConfigController],
  providers: [SessionConfigService],
})
export class SessionConfigModule {}
