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
      
      // Обработка ошибки подключения (сервис не запущен)
      if (error.code === 'ECONNREFUSED' || error.code === 'ENETUNREACH') {
        const port = this.downloaderUrl.split(':').pop() || '5000';
        throw new Error(
          `Python микросервис video-downloader не запущен на порту ${port}.\n\n` +
          `Для скачивания видео по URL необходимо:\n` +
          `1. Перейти в папку video-downloader\n` +
          `2. Запустить: py app.py (или python app.py)\n` +
          `3. Убедиться, что сервис запущен на порту ${port}\n\n` +
          `Альтернативно: загрузите видео файл напрямую через интерфейс.`
        );
      }
      
      // Обработка таймаута
      if (error.code === 'ETIMEDOUT') {
        throw new Error(
          `Таймаут при подключении к downloader сервису. ` +
          `Проверьте, что сервис запущен и доступен на ${this.downloaderUrl}`
        );
      }
      
      // Обработка HTTP ошибок
      if (error.response) {
        const errorMessage = error.response.data?.error || error.response.data?.message || error.message;
        throw new Error(`Ошибка downloader API: ${errorMessage}`);
      }
      
      throw new Error(`Не удалось скачать видео: ${error.message || 'Неизвестная ошибка'}`);
    }
  }

  /**
   * Получает список последних видео из профиля/канала
   */
  async getProfileVideos(profileUrl: string, limit: number = 3): Promise<any> {
    const platform = this.detectPlatform(profileUrl);
    
    if (platform === 'unknown') {
      throw new Error(`Неподдерживаемая платформа. Поддерживаются: YouTube, TikTok, Instagram`);
    }

    console.log(`📋 Получаем список видео из профиля ${platform}: ${profileUrl}`);

    try {
      const response = await this.axiosInstance.get('/profile/videos', {
        params: { url: profileUrl, limit },
      });

      return response.data;
    } catch (error: any) {
      console.error(`❌ Ошибка при получении списка видео:`, error);
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENETUNREACH') {
        const port = this.downloaderUrl.split(':').pop() || '5000';
        throw new Error(
          `Python микросервис video-downloader не запущен на порту ${port}.`
        );
      }
      
      if (error.response) {
        const errorMessage = error.response.data?.error || error.response.data?.message || error.message;
        throw new Error(`Ошибка получения списка видео: ${errorMessage}`);
      }
      
      throw new Error(`Не удалось получить список видео: ${error.message || 'Неизвестная ошибка'}`);
    }
  }

  /**
   * Получает информацию о профиле (bio, description, links)
   */
  async getProfileInfo(profileUrl: string): Promise<any> {
    const platform = this.detectPlatform(profileUrl);
    
    if (platform === 'unknown') {
      throw new Error(`Неподдерживаемая платформа. Поддерживаются: YouTube, TikTok, Instagram`);
    }

    console.log(`📋 Получаем информацию о профиле ${platform}: ${profileUrl}`);

    try {
      const response = await this.axiosInstance.get('/profile/info', {
        params: { url: profileUrl },
      });

      return response.data;
    } catch (error: any) {
      console.error(`❌ Ошибка при получении информации о профиле:`, error);
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENETUNREACH') {
        const port = this.downloaderUrl.split(':').pop() || '5000';
        throw new Error(
          `Python микросервис video-downloader не запущен на порту ${port}.`
        );
      }
      
      if (error.response) {
        const errorMessage = error.response.data?.error || error.response.data?.message || error.message;
        throw new Error(`Ошибка получения информации о профиле: ${errorMessage}`);
      }
      
      // Если не удалось получить информацию, возвращаем пустые данные
      return {
        success: true,
        data: {
          description: '',
          bio: '',
          links: [],
          external_links: false,
          cta_in_bio: '',
        },
      };
    }
  }
}

