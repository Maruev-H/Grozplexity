import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YandexStorageService } from './yandexstorage.service';

@Module({
  imports: [ConfigModule],
  providers: [YandexStorageService],
  exports: [YandexStorageService],
})
export class YandexStorageModule {}

