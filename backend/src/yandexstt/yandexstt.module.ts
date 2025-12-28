import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { YandexSttService } from './yandexstt.service';
import { YandexStorageModule } from '../yandexstorage/yandexstorage.module';

@Module({
  imports: [ConfigModule, YandexStorageModule],
  providers: [YandexSttService],
  exports: [YandexSttService],
})
export class YandexSttModule {}

