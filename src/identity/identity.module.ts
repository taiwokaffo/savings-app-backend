import { Module } from '@nestjs/common';
import { KorapayService } from './korapay.service';

@Module({
  providers: [KorapayService],
  exports: [KorapayService],
})
export class IdentityModule {}
