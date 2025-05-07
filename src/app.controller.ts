import { Body, Controller, Get, Logger, Post, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiProperty } from '@nestjs/swagger';
import { Response } from 'express';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiProperty({
    description:
      'This is the test webhook to receive the data scrapped from the scrapping service once the scrapping for the group is done. it will print the data in the terminal',
  })
  @Post('test-webhook')
  testWebhook(@Body() body: any, @Res() res: Response) {
    this.logger.log(JSON.stringify(body, null, 2));
    return res.status(200).json({ message: 'Webhook received' });
  }
}
