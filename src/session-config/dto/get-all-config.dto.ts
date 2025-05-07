import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GetAllConfigDto {
  @IsString()
  @ApiProperty({ example: 'user123', description: 'The ID of the user' })
  userId: string;
}
