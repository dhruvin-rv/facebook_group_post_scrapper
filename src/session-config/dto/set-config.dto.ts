import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ConfigItemDto {
  @IsString()
  @ApiProperty({ example: 'theme', description: 'The config key to set' })
  key: string;

  @IsString()
  @ApiProperty({ example: 'dark', description: 'The value of the config key' })
  value: string;
}

export class SetConfigDto {
  @IsString()
  @ApiProperty({ example: 'user123', description: 'The ID of the user' })
  userId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ConfigItemDto)
  @ApiProperty({
    type: [ConfigItemDto],
    example: [
      { key: 'theme', value: 'dark' },
      { key: 'language', value: 'en' },
    ],
    description: 'Array of key-value pairs to set',
  })
  configs: ConfigItemDto[];
}
