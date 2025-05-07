import { Body, Controller, Post, Res } from '@nestjs/common';
import { ScrapperService } from './scrapper.service';
import { GetPostsDto } from './dto/get-post.dto';
import { Response } from 'express';

@Controller('scrapper')
export class ScrapperController {
  constructor(private readonly scrapperService: ScrapperService) {}

  @Post()
  async getPosts(@Body() data: GetPostsDto, @Res() response: Response) {
    const startScrapping = await this.scrapperService.startScrapping(data);

    if (startScrapping.status) {
      const responsePayload = {
        status: true,
        data: null,
        message: 'Started Scrapping',
        error: null,
      };

      return response.status(200).json(responsePayload);
    } else {
      const responsePayload = {
        status: false,
        data: null,
        message: null,
        error: startScrapping.message,
      };

      return response.status(400).json(responsePayload);
    }
  }
}
