import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SetConfigDto {
  @IsString()
  @ApiProperty({ example: 'user123', description: 'The ID of the user' })
  userId: string;

  @IsString()
  @ApiProperty({ example: 'theme', description: 'The config key to set' })
  key: string;

  @IsString()
  @ApiProperty({ example: 'dark', description: 'The value of the config key' })
  value: string;
}
