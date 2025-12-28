import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YandexGptService } from './yandexgpt.service';

@Module({
  imports: [ConfigModule],
  providers: [YandexGptService],
  exports: [YandexGptService],
})
export class YandexGptModule {}

