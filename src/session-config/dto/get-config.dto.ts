import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GetConfigDto {
  @IsString()
  @ApiProperty({ example: 'user123', description: 'The ID of the user' })
  userId: string;

  @IsString()
  @ApiProperty({ example: 'theme', description: 'The config key to set' })
  key: string;
}
