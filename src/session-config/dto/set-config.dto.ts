import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ConfigItemDto {
  @IsString()
  @ApiProperty({ example: 'c_user', description: 'The config key to set' })
  key: string;

  @IsString()
  @ApiProperty({ example: 'xs', description: 'The value of the config key' })
  value: string;
}

export class SetConfigDto {
  @IsString()
  @ApiProperty({ example: '1', description: 'The ID of the user' })
  userId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ConfigItemDto)
  @ApiProperty({
    type: [ConfigItemDto],
    example: [
      { key: 'c_user', value: 'dark' },
      { key: 'xs', value: 'en' },
    ],
    description: 'Array of key-value pairs to set',
  })
  configs: ConfigItemDto[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    example: true,
    description: 'Whether to use a proxy for the session',
  })
  useProxy?: boolean;
}
