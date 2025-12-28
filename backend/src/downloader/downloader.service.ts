import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';

@Injectable()
export class DownloaderService {
  private downloaderUrl: string;
  private axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.downloaderUrl = this.configService.get<string>('DOWNLOADER_URL') || 'http://localhost:5000';
    
    this.axiosInstance = axios.create({
      baseURL: this.downloaderUrl,
      timeout: 120000, // 2 минуты для скачивания
    });
  }

  /**
   * Определяет платформу по URL
   */
  detectPlatform(url: string): 'youtube' | 'tiktok' | 'instagram' | 'unknown' {
    const lowerUrl = url.toLowerCase();
    
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
      return 'youtube';
    }
    if (lowerUrl.includes('tiktok.com')) {
      return 'tiktok';
    }
    if (lowerUrl.includes('instagram.com')) {
      return 'instagram';
    }
    
    return 'unknown';
  }

  /**
   * Скачивает видео через universalDownloader
   */
  async downloadVideo(url: string, outputPath: string): Promise<string> {
    const platform = this.detectPlatform(url);
    
    if (platform === 'unknown') {
      throw new Error(`Неподдерживаемая платформа. Поддерживаются: YouTube, TikTok, Instagram`);
    }

    console.log(`📥 Скачиваем видео с ${platform}: ${url}`);

    try {
      let downloadUrl: string;
      let videoData: any;

      // Получаем информацию о видео и ссылку на скачивание
      switch (platform) {
        case 'youtube':
          const youtubeResponse = await this.axiosInstance.get('/api/youtube/download', {
            params: { url },
          });
          videoData = youtubeResponse.data?.data;
          if (!videoData || !videoData.formats || videoData.formats.length === 0) {
            throw new Error('Не удалось получить ссылку на скачивание YouTube видео');
          }
          // Выбираем лучшее качество (первое в списке обычно самое лучшее)
          downloadUrl = videoData.formats[0].url;
          break;

        case 'tiktok':
          const tiktokResponse = await this.axiosInstance.get('/api/tiktok/download', {
            params: { url },
          });
          videoData = tiktokResponse.data?.data;
          if (!videoData || !videoData.downloads || videoData.downloads.length === 0) {
            throw new Error('Не удалось получить ссылку на скачивание TikTok видео');
          }
          // Ищем видео (обычно первый элемент с текстом содержащим "video" или "HD")
          const videoDownload = videoData.downloads.find((d: any) => 
            d.text?.toLowerCase().includes('video') || 
            d.text?.toLowerCase().includes('hd') ||
            d.text?.toLowerCase().includes('mp4')
          ) || videoData.downloads[0];
          downloadUrl = videoDownload.url;
          break;

        case 'instagram':
          const instagramResponse = await this.axiosInstance.get('/api/meta/download', {
            params: { url },
          });
          videoData = instagramResponse.data?.data;
          // Instagram может возвращать разные форматы ответа
          if (videoData?.videoUrl) {
            downloadUrl = videoData.videoUrl;
          } else if (videoData?.url) {
            downloadUrl = videoData.url;
          } else if (videoData?.downloads && videoData.downloads.length > 0) {
            // Если есть массив downloads, берем первый
            downloadUrl = videoData.downloads[0].url || videoData.downloads[0];
          } else {
            throw new Error('Не удалось получить ссылку на скачивание Instagram видео');
          }
          break;

        default:
          throw new Error(`Неподдерживаемая платформа: ${platform}`);
      }

      if (!downloadUrl) {
        throw new Error('Не удалось получить ссылку на скачивание видео');
      }

      console.log(`📥 Скачиваем видео по ссылке: ${downloadUrl.substring(0, 100)}...`);

      // Скачиваем видео файл
      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        timeout: 300000, // 5 минут для скачивания большого файла
      });

      // Определяем расширение файла
      const extension = this.getFileExtension(downloadUrl, platform);
      const finalPath = outputPath.endsWith(extension) ? outputPath : `${outputPath}${extension}`;

      // Сохраняем файл
      const writer = createWriteStream(finalPath);
      await pipeline(response.data, writer);

      console.log(`✅ Видео скачано: ${finalPath}`);
      return finalPath;
    } catch (error: any) {
      console.error(`❌ Ошибка скачивания видео:`, error);
      if (error.response) {
        throw new Error(`Ошибка universalDownloader API: ${error.response.data?.message || error.message}`);
      }
      throw new Error(`Не удалось скачать видео: ${error.message}`);
    }
  }

  /**
   * Определяет расширение файла
   */
  private getFileExtension(url: string, platform: string): string {
    // Пытаемся извлечь расширение из URL
    const urlMatch = url.match(/\.(mp4|webm|mov|avi|mkv)(\?|$)/i);
    if (urlMatch) {
      return `.${urlMatch[1]}`;
    }

    // По умолчанию для каждой платформы
    switch (platform) {
      case 'youtube':
        return '.mp4';
      case 'tiktok':
        return '.mp4';
      case 'instagram':
        return '.mp4';
      default:
        return '.mp4';
    }
  }
}

