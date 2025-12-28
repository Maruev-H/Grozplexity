import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DownloaderService } from './downloader.service';

@Module({
  imports: [ConfigModule],
  providers: [DownloaderService],
  exports: [DownloaderService],
})
export class DownloaderModule {}

