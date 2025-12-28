import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import { createReadStream } from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { YandexStorageService } from '../yandexstorage/yandexstorage.service';

@Injectable()
export class YandexSttService {
  private apiKey: string;
  private folderId: string;
  private axiosInstance: AxiosInstance;

  constructor(
    private configService: ConfigService,
    private storageService: YandexStorageService,
  ) {
    this.apiKey = this.configService.get<string>('YANDEX_API_KEY') || '';
    this.folderId = this.configService.get<string>('YANDEX_FOLDER_ID') || '';

    if (!this.apiKey) {
      console.warn('⚠️ YANDEX_API_KEY не настроен. Транскрипция аудио будет недоступна.');
    }
    if (!this.folderId) {
      console.warn('⚠️ YANDEX_FOLDER_ID не настроен. Транскрипция аудио будет недоступна.');
    }

    // Для синхронного распознавания (старый метод)
    this.axiosInstance = axios.create({
      baseURL: 'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize',
      headers: {
        'Authorization': `Api-Key ${this.apiKey}`,
      },
    });
  }

  async transcribeAudio(audioPath: string, language: string = 'ru-RU'): Promise<string> {
    if (!this.apiKey || !this.folderId) {
      throw new Error('YANDEX_API_KEY и YANDEX_FOLDER_ID должны быть настроены для транскрипции аудио');
    }

    // Читаем аудио файл (вне try блока для доступа в catch)
    let audioData: Buffer | undefined;
    try {
      audioData = fs.readFileSync(audioPath);
      const fileSizeMB = audioData.length / (1024 * 1024);
      
      console.log(`📊 Размер аудио файла: ${fileSizeMB.toFixed(2)} МБ`);
      
      // Yandex Speech-to-Text поддерживает длинные файлы (до 4 часов)
      // Не нужно ограничивать размер файла
      if (fileSizeMB > 100) {
        console.warn(`⚠️ Аудио файл очень большой (${fileSizeMB.toFixed(2)} МБ). Это может занять больше времени для обработки.`);
      }
      
      // Проверяем OGG заголовок перед отправкой
      const header = audioData.slice(0, 4).toString('ascii');
      if (header !== 'OggS') {
        throw new Error(`Файл не является валидным OGG файлом. Заголовок: ${header}`);
      }
      
      console.log(`📤 Отправляем OGG файл в Yandex STT. Размер: ${(audioData.length / 1024).toFixed(2)} КБ, заголовок: ${header}`);
      
      // Создаем FormData для загрузки файла
      // Важно: Yandex STT требует multipart/form-data с полем 'data'
      const formData = new FormData();
      
      // Используем createReadStream для правильной отправки файла
      // Это гарантирует, что файл будет отправлен как бинарные данные без искажений
      const audioStream = createReadStream(audioPath);
      
      // Важно: Yandex STT ожидает поле 'data' с файлом
      // Используем stream напрямую для правильной отправки бинарных данных
      // knownLength помогает FormData правильно сформировать multipart запрос
      formData.append('data', audioStream, {
        filename: 'audio.ogg',
        contentType: 'audio/ogg; codecs=opus', // Указываем кодек для OGG Opus
        knownLength: audioData.length, // Указываем размер для правильной отправки
      });
      formData.append('topic', 'general'); // Тема распознавания
      formData.append('lang', language); // Язык
      
      console.log(`📋 FormData создан. Поля: data (stream, ${audioData.length} байт), topic, lang`);

      const response = await this.axiosInstance.post(
        `?folderId=${this.folderId}`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: 120000, // 120 секунд таймаут для больших файлов
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        },
      );

      if (response.data && response.data.result) {
        return response.data.result;
      }

      throw new Error('Yandex Speech-to-Text вернул пустой результат');
    } catch (error: any) {
      console.error('Error with Yandex Speech-to-Text:', error);
      
      // Обработка ошибки размера файла
      if (error?.response?.status === 400 && error?.response?.data?.error_message?.includes('less than 1 mb')) {
        throw new Error(
          'Аудио файл превышает лимит в 1 МБ. Система автоматически сжимает аудио, но для очень длинных видео может потребоваться разбиение на части.',
        );
      }
      
      // Обработка таймаутов и сетевых ошибок
      if (error.code === 'ETIMEDOUT' || error.code === 'ENETUNREACH' || error.code === 'ECONNREFUSED') {
        throw new Error(
          'Ошибка подключения к Yandex Speech-to-Text. Проверьте интернет-соединение и доступность сервиса.',
        );
      }
      
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        throw new Error(
          'Ошибка аутентификации Yandex Speech-to-Text. Проверьте YANDEX_API_KEY и YANDEX_FOLDER_ID, а также роль speechkit.stt.user.',
        );
      }
      if (error?.response?.status === 429) {
        throw new Error(
          'Превышен лимит запросов Yandex Speech-to-Text. Попробуйте позже.',
        );
      }
      
      const errorMessage = error?.response?.data?.error_message || error?.response?.data?.error?.message || error?.message || 'Unknown error';
      
      // Детальное логирование ошибки
      if (error?.response?.data) {
        console.error('❌ Детали ошибки Yandex STT:', JSON.stringify(error.response.data, null, 2));
      }
      
      // Если ошибка "ogg header has not been found", проверяем файл еще раз
      if ((errorMessage.includes('ogg header') || errorMessage.includes('ogg header has not been found')) && audioData) {
        console.error('❌ Yandex STT не может найти OGG заголовок в отправленном файле');
        console.error(`📊 Размер файла: ${audioData.length} байт`);
        console.error(`📊 Первые 20 байт файла (hex): ${audioData.slice(0, 20).toString('hex')}`);
        console.error(`📊 Первые 4 байта (заголовок): ${audioData.slice(0, 4).toString('ascii')}`);
        console.error(`📊 Первые 4 байта (hex): ${audioData.slice(0, 4).toString('hex')}`);
      }
      
      throw new Error(`Failed to transcribe audio: ${errorMessage}`);
    }
  }

  /**
   * Асинхронное распознавание через Object Storage (поддерживает до 4 часов, до 1 ГБ)
   * @param audioPath Путь к локальному аудио файлу
   * @param language Язык распознавания (по умолчанию ru-RU)
   * @returns Распознанный текст
   */
  async transcribeAudioAsync(audioPath: string, language: string = 'ru-RU'): Promise<string> {
    if (!this.apiKey || !this.folderId) {
      throw new Error('YANDEX_API_KEY и YANDEX_FOLDER_ID должны быть настроены для транскрипции аудио');
    }

    try {
      const fileStats = await fs.promises.stat(audioPath);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      
      console.log(`📊 Размер аудио файла: ${fileSizeMB.toFixed(2)} МБ`);
      
      // Генерируем уникальный ключ для файла в Object Storage
      const timestamp = Date.now();
      const fileName = path.basename(audioPath);
      const objectKey = `audio/${timestamp}_${fileName}`;

      // Шаг 1: Загружаем файл в Object Storage
      console.log(`📤 Загружаем файл в Object Storage...`);
      const audioUri = await this.storageService.uploadFile(audioPath, objectKey);
      
      // Важно: SpeechKit не принимает query параметры в URI
      // Используем обычный URI без presigned параметров
      console.log(`✅ Файл загружен, URI: ${audioUri}`);

      // Шаг 2: Отправляем запрос на асинхронное распознавание (API v2)
      // Согласно документации: https://yandex.cloud/ru/docs/speechkit/stt/api/transcribation-lpcm
      console.log(`📝 Отправляем запрос на асинхронное распознавание...`);
      
      // Формируем правильный URI для Object Storage
      // URI должен быть в формате: https://storage.yandexcloud.net/bucket-name/object-key
      // SpeechKit не принимает query параметры, поэтому используем чистый URI
      
      const requestBody = {
        config: {
          specification: {
            languageCode: language,
            model: 'general', // Модель распознавания (general или deferred-general)
            audioEncoding: 'OGG_OPUS', // Формат аудио
            sampleRateHertz: 16000, // Частота дискретизации для OGG Opus
          },
          folderId: this.folderId,
        },
        audio: {
          uri: audioUri, // URI файла в Object Storage (без query параметров)
        },
      };
      
      console.log(`📋 Тело запроса:`, JSON.stringify(requestBody, null, 2));
      
      const recognitionResponse = await axios.post(
        'https://transcribe.api.cloud.yandex.net/speech/stt/v2/longRunningRecognize',
        requestBody,
        {
          headers: {
            'Authorization': `Api-Key ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 секунд для отправки запроса
        },
      );

      const operationId = recognitionResponse.data.id;
      console.log(`✅ Запрос на распознавание отправлен. Operation ID: ${operationId}`);

      // Шаг 3: Ждем завершения распознавания и получаем результаты
      console.log(`⏳ Ожидаем завершения распознавания...`);
      const transcription = await this.waitForRecognition(operationId);

      // Шаг 4: Удаляем файл из Object Storage (опционально)
      await this.storageService.deleteFile(objectKey).catch(() => {
        // Игнорируем ошибки удаления
      });

      return transcription;
    } catch (error: any) {
      console.error('Error with async Yandex Speech-to-Text:', error);
      
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        throw new Error(
          'Ошибка аутентификации Yandex Speech-to-Text. Проверьте YANDEX_API_KEY и YANDEX_FOLDER_ID, а также роли ai.speechkit-stt.user и storage.uploader.',
        );
      }
      if (error?.response?.status === 429) {
        throw new Error(
          'Превышен лимит запросов Yandex Speech-to-Text. Попробуйте позже.',
        );
      }
      
      const errorMessage = error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'Unknown error';
      throw new Error(`Failed to transcribe audio asynchronously: ${errorMessage}`);
    }
  }

  /**
   * Ожидает завершения распознавания и получает результаты
   * @param operationId ID операции распознавания
   * @returns Распознанный текст
   */
  private async waitForRecognition(operationId: string, maxWaitTime: number = 600000): Promise<string> {
    const startTime = Date.now();
    const checkInterval = 5000; // Проверяем каждые 5 секунд

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await axios.get(
          `https://operation.api.cloud.yandex.net/operations/${operationId}`,
          {
            headers: {
              'Authorization': `Api-Key ${this.apiKey}`,
            },
          },
        );

        const operation = response.data;

        if (operation.done) {
          if (operation.error) {
            throw new Error(`Recognition failed: ${operation.error.message || 'Unknown error'}`);
          }

          // Извлекаем текст из результатов
          const chunks = operation.response?.chunks || [];
          const transcription = chunks
            .map((chunk: any) => chunk.alternatives?.[0]?.text || '')
            .filter((text: string) => text.trim().length > 0)
            .join(' ');

          console.log(`✅ Распознавание завершено. Получено ${chunks.length} сегментов.`);
          return transcription || 'Текст не распознан';
        }

        // Операция еще выполняется
        console.log(`⏳ Распознавание в процессе... (${Math.floor((Date.now() - startTime) / 1000)}с)`);
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      } catch (error: any) {
        if (error?.response?.status === 404) {
          throw new Error('Operation not found. Возможно, операция уже удалена (результаты хранятся 3 суток).');
        }
        throw error;
      }
    }

    throw new Error('Timeout waiting for recognition to complete');
  }
}

