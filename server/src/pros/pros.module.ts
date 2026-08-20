import { Module } from '@nestjs/common';
import { ProsController } from './pros.controller';
import { ProsService } from './pros.service';

@Module({
  controllers: [ProsController],
  providers: [ProsService],
  exports: [ProsService],
})
export class ProsModule {}
