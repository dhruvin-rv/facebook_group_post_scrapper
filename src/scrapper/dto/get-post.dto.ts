import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class GetPostsDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'The groups to scrape posts from',
    example: ['157048338418951', '1536834940393883'],
    type: [String],
  })
  groups: string[];

  @IsNumber()
  @ApiProperty({
    description: 'The maximum age of posts to scrape in hours',
    example: 25,
    type: Number,
  })
  maxPostsAge: number;

  @IsNumber()
  @ApiProperty({
    description: 'The maximum number of posts to scrape from each group',
    example: 100,
    type: Number,
  })
  maxPostsFromGroup: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The user id to use for the session',
    example: '1234567890',
    type: String,
  })
  userId: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description:
      'Post url to receive the scraped data from the scrapping service once the scrapping is done',
    example: 'http://localhost:3000/test-webhook',
    type: String,
  })
  webHookUrl: string;
}
