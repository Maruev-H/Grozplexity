import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { YandexGptModule } from '../yandexgpt/yandexgpt.module';
import { YandexSttModule } from '../yandexstt/yandexstt.module';
import { YandexVisionModule } from '../yandexvision/yandexvision.module';
import { DownloaderModule } from '../downloader/downloader.module';

@Module({
  imports: [ConfigModule, YandexGptModule, YandexSttModule, YandexVisionModule, DownloaderModule],
  controllers: [VideoController],
  providers: [VideoService],
})
export class VideoModule {}

