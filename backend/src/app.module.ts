import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VideoModule } from './video/video.module';
import { YandexGptModule } from './yandexgpt/yandexgpt.module';
import { YandexSttModule } from './yandexstt/yandexstt.module';
import { YandexVisionModule } from './yandexvision/yandexvision.module';
import { YandexStorageModule } from './yandexstorage/yandexstorage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    VideoModule,
    YandexGptModule,
    YandexSttModule,
    YandexVisionModule,
    YandexStorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
