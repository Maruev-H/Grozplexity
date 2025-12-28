import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class DownloaderService {
  private downloaderUrl: string;
  private axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.downloaderUrl = this.configService.get<string>('DOWNLOADER_URL') || 'http://localhost:5000';
    
    this.axiosInstance = axios.create({
      baseURL: this.downloaderUrl,
      timeout: 300000, // 5 минут для скачивания
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
   * Проксирует запрос на скачивание видео в downloader сервис (порт 5000)
   * Возвращает результат с информацией о скачанном файле
   */
  async downloadVideo(url: string): Promise<any> {
    const platform = this.detectPlatform(url);
    
    if (platform === 'unknown') {
      throw new Error(`Неподдерживаемая платформа. Поддерживаются: YouTube, TikTok, Instagram`);
    }

    console.log(`📥 Проксируем запрос на скачивание ${platform} видео: ${url}`);

    try {
      // Просто пересылаем запрос в downloader сервис на порту 5000
      // Python микросервис сам определит платформу и скачает видео
      const response = await this.axiosInstance.get('/download', {
        params: { url },
      });

      // Возвращаем данные от downloader сервиса
      return response.data;
    } catch (error: any) {
      console.error(`❌ Ошибка при проксировании запроса:`, error);
      if (error.response) {
        throw new Error(`Ошибка downloader API: ${error.response.data?.error || error.response.data?.message || error.message}`);
      }
      throw new Error(`Не удалось скачать видео: ${error.message}`);
    }
  }
}

