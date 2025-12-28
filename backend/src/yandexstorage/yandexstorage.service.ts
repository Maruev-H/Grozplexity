import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import { createReadStream } from 'fs';
import * as path from 'path';

@Injectable()
export class YandexStorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private endpoint: string;

  constructor(private configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('YANDEX_S3_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('YANDEX_S3_SECRET_ACCESS_KEY');
    this.bucketName = this.configService.get<string>('YANDEX_S3_BUCKET_NAME') || 'grozplex';
    this.endpoint = this.configService.get<string>('YANDEX_S3_ENDPOINT') || 'https://storage.yandexcloud.net';

    if (!accessKeyId || !secretAccessKey) {
      console.warn('⚠️ YANDEX_S3_ACCESS_KEY_ID и YANDEX_S3_SECRET_ACCESS_KEY не настроены. Загрузка в Object Storage будет недоступна.');
      console.warn('   Для асинхронного распознавания нужно создать статический ключ доступа в Yandex Cloud.');
      console.warn('   Инструкция: https://cloud.yandex.ru/docs/iam/operations/sa/create-access-key');
    } else {
      console.log(`✅ Object Storage настроен: бакет=${this.bucketName}, endpoint=${this.endpoint}`);
      console.log(`   Access Key ID: ${accessKeyId.substring(0, 8)}...`);
    }

    // Yandex Object Storage использует S3-совместимый API
    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region: 'ru-central1',
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
      forcePathStyle: true, // Yandex Object Storage требует path-style URLs
    });
  }

  /**
   * Загружает файл в Yandex Object Storage
   * @param filePath Путь к локальному файлу
   * @param objectKey Ключ объекта в бакете (путь в бакете)
   * @returns URL загруженного файла
   */
  async uploadFile(filePath: string, objectKey: string): Promise<string> {
    try {
      const accessKeyId = this.configService.get<string>('YANDEX_S3_ACCESS_KEY_ID');
      const secretAccessKey = this.configService.get<string>('YANDEX_S3_SECRET_ACCESS_KEY');
      
      if (!accessKeyId || !secretAccessKey) {
        throw new Error('YANDEX_S3_ACCESS_KEY_ID и YANDEX_S3_SECRET_ACCESS_KEY должны быть настроены в .env файле');
      }

      const fileStream = createReadStream(filePath);
      const fileStats = await fs.promises.stat(filePath);
      
      console.log(`📤 Загружаем файл в Object Storage:`);
      console.log(`   Бакет: ${this.bucketName}`);
      console.log(`   Ключ объекта: ${objectKey}`);
      console.log(`   Размер: ${(fileStats.size / 1024 / 1024).toFixed(2)} МБ`);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        Body: fileStream,
        ContentType: 'audio/ogg',
      });

      await this.s3Client.send(command);

      // Формируем URI для Yandex SpeechKit
      // URI должен быть в формате: https://storage.yandexcloud.net/bucket-name/object-key
      // Без query параметров, так как SpeechKit их не принимает
      const uri = `${this.endpoint}/${this.bucketName}/${objectKey}`;
      
      console.log(`✅ Файл загружен в Object Storage: ${uri}`);
      return uri;
    } catch (error: any) {
      console.error('❌ Ошибка загрузки файла в Object Storage:', error);
      
      // Детальная обработка ошибок доступа
      if (error.name === 'AccessDenied' || error.Code === 'AccessDenied') {
        const errorMessage = `
❌ ОШИБКА ДОСТУПА К OBJECT STORAGE:

Проблема: Access Denied при попытке загрузить файл в бакет "${this.bucketName}"

Возможные причины:
1. Неправильные YANDEX_S3_ACCESS_KEY_ID или YANDEX_S3_SECRET_ACCESS_KEY
2. У сервисного аккаунта нет роли storage.uploader или storage.editor
3. Бакет не существует или находится в другом каталоге
4. Статический ключ доступа был удален или недействителен

Решение:
1. Проверьте переменные окружения в backend/.env:
   YANDEX_S3_ACCESS_KEY_ID=...
   YANDEX_S3_SECRET_ACCESS_KEY=...
   YANDEX_S3_BUCKET_NAME=grozplex

2. Убедитесь, что сервисный аккаунт имеет роль storage.uploader:
   - Перейдите в Yandex Cloud → Сервисные аккаунты
   - Откройте ваш сервисный аккаунт
   - Вкладка "Роли" → Добавьте роль "Storage Uploader" (storage.uploader)

3. Проверьте, что бакет существует и находится в правильном каталоге

4. Создайте новый статический ключ доступа, если старый не работает
        `.trim();
        throw new Error(errorMessage);
      }
      
      throw new Error(`Failed to upload file to Object Storage: ${error.message || error.Code || 'Unknown error'}`);
    }
  }

  /**
   * Генерирует presigned URL для файла (для бакетов с ограниченным доступом)
   * @param objectKey Ключ объекта в бакете
   * @param expiresIn Время жизни URL в секундах (по умолчанию 1 час)
   * @returns Presigned URL
   */
  async getPresignedUrl(objectKey: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error: any) {
      console.error('❌ Ошибка генерации presigned URL:', error);
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Удаляет файл из Object Storage
   * @param objectKey Ключ объекта в бакете
   */
  async deleteFile(objectKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });

      await this.s3Client.send(command);
      console.log(`🗑️ Файл удален из Object Storage: ${objectKey}`);
    } catch (error: any) {
      console.error('❌ Ошибка удаления файла из Object Storage:', error);
      // Не бросаем ошибку, так как удаление не критично
    }
  }
}

