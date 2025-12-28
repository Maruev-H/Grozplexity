import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class YandexVisionService {
  private apiKey: string;
  private folderId: string;
  private axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('YANDEX_API_KEY') || '';
    this.folderId = this.configService.get<string>('YANDEX_FOLDER_ID') || '';

    if (!this.apiKey) {
      console.warn('⚠️ YANDEX_API_KEY не настроен. Анализ изображений будет недоступен.');
    }
    if (!this.folderId) {
      console.warn('⚠️ YANDEX_FOLDER_ID не настроен. Анализ изображений будет недоступен.');
    }

    this.axiosInstance = axios.create({
      baseURL: 'https://vision.api.cloud.yandex.net/vision/v1',
      headers: {
        'Authorization': `Api-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async analyzeImage(imageBase64: string, context: string = ''): Promise<string> {
    if (!this.apiKey || !this.folderId) {
      throw new Error('YANDEX_API_KEY и YANDEX_FOLDER_ID должны быть настроены для анализа изображений');
    }

    try {
      const response = await this.axiosInstance.post('/batchAnalyze', {
        folderId: this.folderId,
        analyzeSpecs: [
          {
            features: [
              {
                type: 'TEXT_DETECTION', // Определение текста
              },
              {
                type: 'FACE_DETECTION', // Определение лиц
              },
              {
                type: 'CLASSIFICATION', // Классификация изображения
              },
            ],
            mimeType: 'image/png',
            content: imageBase64,
          },
        ],
      });

      // Формируем описание на основе результатов анализа
      const descriptions: string[] = [];
      
      if (response.data.results && response.data.results[0]) {
        const result = response.data.results[0];
        
        // Классификация изображения
        if (result.classification && result.classification.properties) {
          const properties = result.classification.properties;
          if (properties.length > 0) {
            const topClass = properties[0];
            descriptions.push(`Тип: ${topClass.name} (вероятность: ${(topClass.probability * 100).toFixed(1)}%)`);
          }
        }
        
        // Определение текста
        if (result.textDetection && result.textDetection.pages) {
          const textBlocks: string[] = [];
          result.textDetection.pages.forEach((page: any) => {
            if (page.blocks) {
              page.blocks.forEach((block: any) => {
                if (block.lines) {
                  block.lines.forEach((line: any) => {
                    if (line.words) {
                      const words = line.words.map((w: any) => w.text).join(' ');
                      if (words.trim()) {
                        textBlocks.push(words.trim());
                      }
                    }
                  });
                }
              });
            }
          });
          if (textBlocks.length > 0) {
            descriptions.push(`Текст в кадре: ${textBlocks.join(', ')}`);
          }
        }
        
        // Определение лиц
        if (result.faceDetection && result.faceDetection.faces) {
          const facesCount = result.faceDetection.faces.length;
          if (facesCount > 0) {
            descriptions.push(`Обнаружено лиц: ${facesCount}`);
          }
        }
      }

      // Если есть контекст, добавляем его
      let description = descriptions.length > 0 
        ? descriptions.join('. ') 
        : 'Изображение проанализировано';
      
      if (context) {
        description = `${context}. ${description}`;
      }

      return description;
    } catch (error: any) {
      console.error('Error with Yandex Vision API:', error);
      
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        throw new Error(
          'Ошибка аутентификации Yandex Vision API. Проверьте YANDEX_API_KEY и YANDEX_FOLDER_ID, а также роль ai.vision.user.',
        );
      }
      if (error?.response?.status === 429) {
        throw new Error(
          'Превышен лимит запросов Yandex Vision API. Попробуйте позже.',
        );
      }
      
      const errorMessage = error?.response?.data?.error?.message || error?.message || 'Unknown error';
      throw new Error(`Failed to analyze image: ${errorMessage}`);
    }
  }

  async describeImage(imageBase64: string, context: string = ''): Promise<string> {
    // Используем анализ изображения для создания описания
    try {
      const analysis = await this.analyzeImage(imageBase64, context);
      return analysis;
    } catch (error: any) {
      // Если Vision API не работает, возвращаем базовое описание
      console.warn('⚠️ Yandex Vision API недоступен, используем базовое описание');
      return context || 'Кадр из видео';
    }
  }
}

