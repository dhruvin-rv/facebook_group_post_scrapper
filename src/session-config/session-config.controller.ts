import { Body, Controller, Post } from '@nestjs/common';
import { SessionConfigService } from './session-config.service';
import { SetConfigDto } from './dto/set-config.dto';
import { GetConfigDto } from './dto/get-config.dto';
import { GetAllConfigDto } from './dto/get-all-config.dto';

@Controller('session-config')
export class SessionConfigController {
  constructor(private readonly configService: SessionConfigService) {}

  @Post('set-session-config')
  setConfig(@Body() body: SetConfigDto) {
    this.configService.setConfig(body.userId, body.key, body.value);
    return { message: 'Config set' };
  }

  @Post('get-session-config')
  getConfig(@Body() body: GetConfigDto) {
    const value = this.configService.getConfig(body.userId, body.key);
    return { value };
  }

  @Post('get-all-config')
  getAll(@Body() body: GetAllConfigDto) {
    return this.configService.getAllConfig(body.userId);
  }
}
