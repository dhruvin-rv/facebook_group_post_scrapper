import { Controller, Post, Body, Get, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SessionConfigService } from './session-config.service';
import { SetConfigDto } from './dto/set-config.dto';

@ApiTags('session-config')
@Controller('session-config')
export class SessionConfigController {
  constructor(private readonly sessionConfigService: SessionConfigService) {}

  @Post()
  @ApiOperation({ summary: 'Set multiple config values for a user' })
  @ApiResponse({ status: 200, description: 'Config values set successfully' })
  async setConfig(@Body() data: SetConfigDto): Promise<void> {
    await this.sessionConfigService.setConfig(data);
  }

  @Get(':userId/:key')
  @ApiOperation({ summary: 'Get a specific config value for a user' })
  @ApiResponse({ status: 200, description: 'Returns the config value' })
  getConfig(
    @Param('userId') userId: string,
    @Param('key') key: string,
  ): string | undefined {
    return this.sessionConfigService.getConfig(userId, key);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get all config values for a user' })
  @ApiResponse({ status: 200, description: 'Returns all config values' })
  getAllConfigs(
    @Param('userId') userId: string,
  ): { [key: string]: string } | undefined {
    return this.sessionConfigService.getAllConfigs(userId);
  }

  @Delete(':userId/:key')
  @ApiOperation({ summary: 'Delete a specific config value for a user' })
  @ApiResponse({
    status: 200,
    description: 'Config value deleted successfully',
  })
  deleteConfig(
    @Param('userId') userId: string,
    @Param('key') key: string,
  ): void {
    this.sessionConfigService.deleteConfig(userId, key);
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Delete all config values for a user' })
  @ApiResponse({
    status: 200,
    description: 'All config values deleted successfully',
  })
  deleteAllConfigs(@Param('userId') userId: string): void {
    this.sessionConfigService.deleteAllConfigs(userId);
  }
}
