import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YandexVisionService } from './yandexvision.service';

@Module({
  imports: [ConfigModule],
  providers: [YandexVisionService],
  exports: [YandexVisionService],
})
export class YandexVisionModule {}

