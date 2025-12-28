import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import ffmpeg from 'fluent-ffmpeg';
import { YandexGptService } from '../yandexgpt/yandexgpt.service';
import { YandexSttService } from '../yandexstt/yandexstt.service';
import { YandexVisionService } from '../yandexvision/yandexvision.service';
import { DownloaderService } from '../downloader/downloader.service';

const execAsync = promisify(exec);

@Injectable()
export class VideoService {
  private readonly uploadsDir = path.join(process.cwd(), 'uploads');
  private readonly processedDir = path.join(process.cwd(), 'processed');

  constructor(
    private configService: ConfigService,
    private yandexGptService: YandexGptService,
    private yandexSttService: YandexSttService,
    private yandexVisionService: YandexVisionService,
    private downloaderService: DownloaderService,
  ) {
    // Настройка пути к FFmpeg
    const ffmpegPath = this.configService.get<string>('FFMPEG_PATH');
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(path.join(ffmpegPath, 'ffmpeg.exe'));
      ffmpeg.setFfprobePath(path.join(ffmpegPath, 'ffprobe.exe'));
      console.log(`✅ FFmpeg настроен: ${ffmpegPath}`);
    } else {
      // Попытка использовать системный FFmpeg
      console.log('ℹ️ FFMPEG_PATH не указан, используется системный FFmpeg');
    }

    // Инициализация Yandex Speech-to-Text
    const yandexApiKey = this.configService.get<string>('YANDEX_API_KEY');
    const yandexFolderId = this.configService.get<string>('YANDEX_FOLDER_ID');
    if (yandexApiKey && yandexFolderId) {
      console.log('✅ Yandex Speech-to-Text инициализирован');
    } else {
      console.log(
        'ℹ️ YANDEX_API_KEY и YANDEX_FOLDER_ID должны быть настроены для транскрипции аудио.',
      );
      console.log(
        'Анализ будет выполнен на основе визуального контекста через Yandex GPT.',
      );
    }
    this.ensureDirectories();
  }

  private async ensureDirectories() {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    await fs.mkdir(this.processedDir, { recursive: true });
  }

  async processVideo(file: {
    filename: string;
    path?: string;
    destination?: string;
  }): Promise<any> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Multer с diskStorage сохраняет файл и устанавливает path
    const filePath = file.path || path.join(this.uploadsDir, file.filename);
    const audioPath = path.join(this.processedDir, `${file.filename}.ogg`); // OGG для Yandex STT
    const framesDir = path.join(this.processedDir, `${file.filename}_frames`);

    try {
      // Проверяем длительность видео (максимум 5 минут)
      const videoInfo = await new Promise<any>((resolveInfo, rejectInfo) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) rejectInfo(err);
          else resolveInfo(metadata);
        });
      });

      const duration = videoInfo.format.duration || 0;
      const durationMinutes = duration / 60;
      const durationHours = durationMinutes / 60;
      
      // Yandex STT поддерживает до 4 часов аудио
      if (durationHours > 4) {
        throw new BadRequestException(
          `Видео слишком длинное (${durationHours.toFixed(1)} часов). Максимальная длительность: 4 часа. Пожалуйста, загрузите более короткое видео.`,
        );
      }

      console.log(`📹 Длительность видео: ${durationMinutes.toFixed(1)} минут (${durationHours.toFixed(2)} часов)`);

      // Уровень 1: Извлечение аудио и транскрипция
      // Yandex STT поддерживает длинные файлы до 4 часов, извлекаем весь аудио целиком
      const audioPath = path.join(this.processedDir, `${file.filename}_audio.ogg`);
      await this.extractAudio(filePath, audioPath);
      const transcript = await this.transcribeAudio(audioPath, duration);

      // Извлечение кадров (опционально)
      await fs.mkdir(framesDir, { recursive: true });
      const frames = await this.extractKeyframes(filePath, framesDir, duration);

      // Уровень 2: Анализ контента
      let visualDescription: string | undefined;
      try {
        if (frames.length > 0) {
          // Улучшаем описания кадров через GPT для более детального анализа
          const enhancedFrames = await Promise.all(
            frames.map(async (frame, index) => {
              try {
                return await this.yandexGptService.enhanceFrameDescription(
                  frame,
                  `Кадр ${index + 1} из видео`,
                );
              } catch (error) {
                return frame; // Возвращаем исходное описание если улучшение не удалось
              }
            }),
          );
          
          visualDescription = await this.yandexGptService.analyzeVisualContext(enhancedFrames);
        }
      } catch (error: any) {
        console.warn('⚠️ Не удалось проанализировать визуальный контекст:', error.message);
        // Продолжаем без визуального описания
        visualDescription = undefined;
      }

      let stylePassport: any;
      try {
        stylePassport = await this.yandexGptService.analyzeVideoContent(
          transcript,
          visualDescription,
        );
      } catch (error: any) {
        // Если ошибка связана с аутентификацией или лимитами, возвращаем понятное сообщение
        if (error.message?.includes('аутентификации') || error.message?.includes('лимит') || error.message?.includes('API')) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }

      return {
        transcript,
        frames: frames.slice(0, 5), // Первые 5 кадров для примера
        stylePassport,
        visualDescription,
      };
    } catch (error) {
      console.error('Error processing video:', error);
      throw new BadRequestException(
        `Failed to process video: ${error.message}`,
      );
    } finally {
      // Очистка временных файлов
      try {
        await fs.unlink(filePath).catch(() => {});
        await fs.unlink(audioPath).catch(() => {});
        await fs
          .rm(framesDir, { recursive: true, force: true })
          .catch(() => {});
      } catch (e) {
        // Игнорируем ошибки очистки
      }
    }
  }

  private async extractAudio(
    videoPath: string,
    audioPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Конвертируем в OGG Opus для Yandex Speech-to-Text (требует OGG формат)
      // Используем низкий битрейт для уменьшения размера (Yandex STT ограничение 1 МБ)
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec('libopus') // Используем Opus кодек для OGG
        .audioBitrate('32k') // Низкий битрейт для уменьшения размера
        .audioFrequency(16000) // 16 kHz для Speech-to-Text
        .audioChannels(1) // Моно для уменьшения размера
        .format('ogg') // Явно указываем формат OGG
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private async transcribeAudioFromVideo(videoPath: string, videoDuration: number): Promise<string> {
    // Транскрибируем аудио напрямую из видео, извлекая части по мере необходимости
    try {
      // Вычисляем оптимальную длительность части на основе размера файла
      // При битрейте 24k: ~0.003 МБ/сек (безопасный для качества распознавания)
      // Безопасно используем 0.7 МБ как целевой размер части (с запасом)
      const targetSizeMB = 0.7;
      const bytesPerSecond = (24 * 1024) / 8; // 24k битрейт в байтах/секунду
      const targetChunkDuration = Math.floor((targetSizeMB * 1024 * 1024) / bytesPerSecond);
      
      // Минимум 15 секунд, максимум 25 секунд на часть (для сохранения качества)
      const chunkDuration = Math.max(15, Math.min(25, targetChunkDuration));
      const chunksCount = Math.ceil(videoDuration / chunkDuration);
      
      console.log(`📦 Разбиваем на ${chunksCount} частей по ${chunkDuration} секунд (целевой размер: ~${targetSizeMB} МБ, битрейт: 24k для качества)`);
      
      const transcriptions: string[] = [];
      
      for (let i = 0; i < chunksCount; i++) {
        const startTime = i * chunkDuration;
        const chunkDurationActual = Math.min(chunkDuration, videoDuration - startTime);
        
        if (chunkDurationActual <= 0) break;
        
        console.log(`📝 Транскрибируем часть ${i + 1}/${chunksCount} (${startTime}с - ${startTime + chunkDurationActual}с)`);
        
        // Извлекаем часть аудио напрямую из видео с умеренным сжатием (24k битрейт)
        const chunkPath = path.join(this.processedDir, `chunk_${i}_${Date.now()}.ogg`);
        await this.extractAudioChunkFromVideo(videoPath, chunkPath, startTime, chunkDurationActual);
        
        // Проверяем размер части
        const chunkStats = await fs.stat(chunkPath);
        const chunkSizeMB = chunkStats.size / (1024 * 1024);
        
        console.log(`📊 Размер части ${i + 1}: ${chunkSizeMB.toFixed(2)} МБ`);
        
        if (chunkSizeMB > 1) {
          // Если часть все еще большая, разбиваем её на более мелкие части (рекурсивно)
          console.warn(`⚠️ Часть ${i + 1} все еще большая (${chunkSizeMB.toFixed(2)} МБ). Разбиваем на более мелкие части...`);
          
          // Разбиваем на части по 10 секунд (очень маленькие для гарантии < 1 МБ)
          const subChunkDuration = 10;
          const subChunks = Math.ceil(chunkDurationActual / subChunkDuration);
          
          // Удаляем большую часть
          await fs.unlink(chunkPath).catch(() => {});
          
          for (let j = 0; j < subChunks; j++) {
            const subStartTime = startTime + (j * subChunkDuration);
            const subDuration = Math.min(subChunkDuration, videoDuration - subStartTime);
            
            if (subDuration <= 0) break;
            
            console.log(`  📝 Подчасть ${i + 1}.${j + 1} (${subStartTime}с - ${subStartTime + subDuration}с)`);
            
            const subChunkPath = path.join(this.processedDir, `chunk_${i}_${j}_${Date.now()}.ogg`);
            await this.extractAudioChunkFromVideo(videoPath, subChunkPath, subStartTime, subDuration);
            
            const subChunkStats = await fs.stat(subChunkPath);
            const subChunkSizeMB = subChunkStats.size / (1024 * 1024);
            
            if (subChunkSizeMB > 1) {
              // Если даже 10 секунд > 1 МБ, это очень высокий битрейт исходного аудио
              // Используем минимальное сжатие (20k) - все еще приемлемо для качества
              console.warn(`  ⚠️ Подчасть ${i + 1}.${j + 1} все еще большая (${subChunkSizeMB.toFixed(2)} МБ). Применяем минимальное дополнительное сжатие...`);
              const compressedPath = subChunkPath.replace('.ogg', '_compressed.ogg');
              await this.compressAudio(subChunkPath, compressedPath); // 24k -> 20k (минимальная потеря качества)
              
              const compressedStats = await fs.stat(compressedPath);
              const compressedSizeMB = compressedStats.size / (1024 * 1024);
              
              if (compressedSizeMB > 1) {
                // Если даже после сжатия не помещается, разбиваем на еще более мелкие части (5 секунд)
                console.warn(`  ⚠️ Подчасть ${i + 1}.${j + 1} все еще большая после сжатия. Разбиваем на микрочасти по 5 секунд...`);
                
                await fs.unlink(compressedPath).catch(() => {});
                await fs.unlink(subChunkPath).catch(() => {});
                
                const microChunkDuration = 5;
                const microChunks = Math.ceil(subDuration / microChunkDuration);
                
                for (let k = 0; k < microChunks; k++) {
                  const microStartTime = subStartTime + (k * microChunkDuration);
                  const microDuration = Math.min(microChunkDuration, videoDuration - microStartTime);
                  
                  if (microDuration <= 0) break;
                  
                  console.log(`    📝 Микрочасть ${i + 1}.${j + 1}.${k + 1} (${microStartTime}с - ${microStartTime + microDuration}с)`);
                  
                  const microChunkPath = path.join(this.processedDir, `chunk_${i}_${j}_${k}_${Date.now()}.ogg`);
                  await this.extractAudioChunkFromVideo(videoPath, microChunkPath, microStartTime, microDuration);
                  
                  const microTranscription = await this.yandexSttService.transcribeAudio(microChunkPath, 'ru-RU');
                  transcriptions.push(microTranscription);
                  await fs.unlink(microChunkPath).catch(() => {});
                }
              } else {
                const subTranscription = await this.yandexSttService.transcribeAudio(compressedPath, 'ru-RU');
                transcriptions.push(subTranscription);
                
                await fs.unlink(compressedPath).catch(() => {});
                await fs.unlink(subChunkPath).catch(() => {});
              }
            } else {
              // Проверяем файл перед отправкой
              try {
                const fileBuffer = await fs.readFile(subChunkPath);
                const header = fileBuffer.slice(0, 4).toString('ascii');
                if (header !== 'OggS') {
                  console.error(`❌ Ошибка: файл ${subChunkPath} не является валидным OGG файлом. Заголовок: ${header}`);
                  await fs.unlink(subChunkPath).catch(() => {});
                  continue; // Пропускаем этот файл
                }
              } catch (checkError) {
                console.error(`❌ Ошибка проверки файла ${subChunkPath}: ${checkError.message}`);
                await fs.unlink(subChunkPath).catch(() => {});
                continue; // Пропускаем этот файл
              }
              
              const subTranscription = await this.yandexSttService.transcribeAudio(subChunkPath, 'ru-RU');
              transcriptions.push(subTranscription);
              await fs.unlink(subChunkPath).catch(() => {});
            }
          }
        } else {
          // Транскрибируем часть
          const chunkTranscription = await this.yandexSttService.transcribeAudio(chunkPath, 'ru-RU');
          transcriptions.push(chunkTranscription);
          
          // Удаляем временный файл
          await fs.unlink(chunkPath).catch(() => {});
        }
      }
      
      // Объединяем все транскрипции
      const fullTranscription = transcriptions.join(' ');
      console.log(`✅ Транскрипция завершена. Всего частей: ${transcriptions.length}`);
      return fullTranscription;
    } catch (error: any) {
      console.error('Error with Yandex Speech-to-Text:', error);
      
      // Если ошибка связана с размером файла, возвращаем понятное сообщение
      if (error.message?.includes('слишком большой') || error.message?.includes('less than 1 mb') || error.message?.includes('should be less than')) {
        return `Ошибка транскрипции: ${error.message}. Анализ будет выполнен на основе визуального контекста через Yandex GPT.`;
      }
      
      // Если ошибка связана с аутентификацией или лимитами, возвращаем понятное сообщение
      if (error.message?.includes('аутентификации') || error.message?.includes('лимит') || error.message?.includes('API')) {
        return `Ошибка транскрипции: ${error.message}. Анализ будет выполнен на основе визуального контекста через Yandex GPT.`;
      }
      
      // Fallback: если транскрипция не удалась, возвращаем сообщение
      return 'Транскрипция аудио не удалась. Анализ будет выполнен на основе визуального контекста через Yandex GPT.';
    }
  }

  private async transcribeAudio(audioPath: string, videoDuration: number = 0): Promise<string> {
    // Используем Yandex Speech-to-Text API для транскрипции аудио
    try {
      // Проверяем размер файла перед отправкой
      const stats = await fs.stat(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      console.log(`📊 Размер аудио файла: ${fileSizeMB.toFixed(2)} МБ`);
      
      // Yandex STT поддерживает длинные файлы (до 4 часов), отправляем целиком
      // Если файл очень большой (> 50 МБ), можем попробовать сжать, но обычно не нужно
      if (fileSizeMB > 50) {
        console.warn(`⚠️ Аудио файл очень большой (${fileSizeMB.toFixed(2)} МБ). Попытка дополнительного сжатия...`);
        const compressedPath = audioPath.replace('.ogg', '_compressed.ogg');
        await this.compressAudio(audioPath, compressedPath);
        
        const compressedStats = await fs.stat(compressedPath);
        const compressedSizeMB = compressedStats.size / (1024 * 1024);
        
        console.log(`📊 Размер после сжатия: ${compressedSizeMB.toFixed(2)} МБ`);
        
        const transcription = await this.yandexSttService.transcribeAudio(compressedPath, 'ru-RU');
        await fs.unlink(compressedPath).catch(() => {});
        return transcription;
      }
      
      // Используем асинхронное распознавание через Object Storage (поддерживает до 4 часов, до 1 ГБ)
      // Это более надежно для длинных файлов
      try {
        const transcription = await this.yandexSttService.transcribeAudioAsync(audioPath, 'ru-RU');
        return transcription;
      } catch (asyncError: any) {
        console.warn(`⚠️ Асинхронное распознавание не удалось: ${asyncError.message}`);
        
        // Проверяем размер файла перед fallback на синхронное распознавание
        const stats = await fs.stat(audioPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        if (fileSizeMB > 1) {
          // Файл слишком большой для синхронного распознавания (> 1 МБ)
          throw new Error(
            `Аудио файл слишком большой (${fileSizeMB.toFixed(2)} МБ) для синхронного распознавания. ` +
            `Необходимо настроить Object Storage для асинхронного распознавания. ` +
            `Ошибка: ${asyncError.message}`
          );
        }
        
        console.log(`🔄 Пробуем синхронное распознавание (файл ${fileSizeMB.toFixed(2)} МБ)...`);
        // Fallback на синхронное распознавание только для файлов <= 1 МБ
        const transcription = await this.yandexSttService.transcribeAudio(audioPath, 'ru-RU');
        return transcription;
      }
    } catch (error: any) {
      console.error('Error with Yandex Speech-to-Text:', error);
      
      // Если ошибка связана с размером файла, возвращаем понятное сообщение
      if (error.message?.includes('слишком большой') || error.message?.includes('less than 1 mb') || error.message?.includes('should be less than')) {
        return `Ошибка транскрипции: ${error.message}. Анализ будет выполнен на основе визуального контекста через Yandex GPT.`;
      }
      
      // Если ошибка связана с аутентификацией или лимитами, возвращаем понятное сообщение
      if (error.message?.includes('аутентификации') || error.message?.includes('лимит') || error.message?.includes('API')) {
        return `Ошибка транскрипции: ${error.message}. Анализ будет выполнен на основе визуального контекста через Yandex GPT.`;
      }
      
      // Fallback: если транскрипция не удалась, возвращаем сообщение
      return 'Транскрипция аудио не удалась. Анализ будет выполнен на основе визуального контекста через Yandex GPT.';
    }
  }

  private async compressAudio(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Дополнительное сжатие с минимальной потерей качества (20k битрейт)
      // 20k - это минимальный битрейт, который еще сохраняет приемлемое качество для распознавания речи
      ffmpeg(inputPath)
        .output(outputPath)
        .audioCodec('libopus') // Используем Opus кодек для OGG
        .audioBitrate('20k') // Минимальный битрейт с сохранением качества
        .audioFrequency(16000) // 16 kHz
        .audioChannels(1) // Моно
        .format('ogg') // Явно указываем формат OGG
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private async extractAudioChunk(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Извлекаем часть аудио из исходного файла
      ffmpeg(inputPath)
        .seekInput(startTime) // Начинаем с указанного времени
        .duration(duration) // Длительность части
        .output(outputPath)
        .audioCodec('libopus') // Используем Opus кодек для OGG
        .audioBitrate('32k') // Низкий битрейт
        .audioFrequency(16000) // 16 kHz
        .audioChannels(1) // Моно
        .format('ogg') // Явно указываем формат OGG
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  private async extractAudioChunkFromVideo(
    videoPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Извлекаем часть аудио напрямую из видео в OGG Opus
      // Важно: используем -ss перед -i для более точного позиционирования
      // Это гарантирует правильное извлечение части без проблем с временными метками
      ffmpeg(videoPath)
        .seekInput(startTime) // Позиционируемся на нужное время
        .duration(duration) // Длительность части
        .output(outputPath)
        .audioCodec('libopus') // Используем Opus кодек для OGG
        .audioBitrate('24k') // Оптимальный битрейт для качества распознавания
        .audioFrequency(16000) // 16 kHz (стандарт для Speech-to-Text)
        .audioChannels(1) // Моно
        .format('ogg') // Явно указываем формат OGG
        .outputOptions([
          '-avoid_negative_ts', 'make_zero', // Избегаем проблем с временными метками
          '-strict', '-2', // Разрешаем экспериментальные кодеки
          '-acodec', 'libopus', // Явно указываем аудио кодек
          '-f', 'ogg', // Явно указываем формат
        ])
        .on('start', (commandLine) => {
          console.log(`🎬 FFmpeg команда (Video->OGG): ${commandLine}`);
        })
        .on('end', async () => {
          // Проверяем, что файл создан и имеет правильный размер
          try {
            const stats = await fs.stat(outputPath);
            console.log(`✅ OGG файл создан: ${outputPath}, размер: ${(stats.size / 1024).toFixed(2)} КБ`);
            
            // Проверяем первые байты файла на наличие OGG заголовка
            const fileBuffer = await fs.readFile(outputPath);
            const header = fileBuffer.slice(0, 4).toString('ascii');
            if (header !== 'OggS') {
              console.error(`❌ ОШИБКА: файл не начинается с OGG заголовка. Первые байты: ${header}`);
              console.error(`📊 Первые 20 байт (hex): ${fileBuffer.slice(0, 20).toString('hex')}`);
              reject(new Error(`Созданный файл не является валидным OGG файлом. Заголовок: ${header}`));
              return;
            } else {
              console.log(`✅ OGG заголовок найден, файл валиден`);
            }
          } catch (checkError) {
            console.warn(`⚠️ Не удалось проверить файл: ${checkError.message}`);
          }
          resolve();
        })
        .on('error', (err) => {
          console.error(`❌ Ошибка FFmpeg при извлечении части: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  private async extractAudioChunkCompressed(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Извлекаем часть аудио с умеренным сжатием (24k битрейт)
      // 24k - оптимальный баланс между размером и качеством для распознавания речи
      ffmpeg(inputPath)
        .seekInput(startTime) // Начинаем с указанного времени
        .duration(duration) // Длительность части
        .output(outputPath)
        .audioCodec('libopus') // Используем Opus кодек для OGG
        .audioBitrate('24k') // Оптимальный битрейт для качества распознавания
        .audioFrequency(16000) // 16 kHz (стандарт для Speech-to-Text)
        .audioChannels(1) // Моно
        .format('ogg') // Явно указываем формат OGG
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }


  private async extractKeyframes(
    videoPath: string,
    outputDir: string,
    videoDuration: number = 0,
  ): Promise<string[]> {
    return new Promise(async (resolve) => {
      const frames: string[] = [];
      const totalFrames = 5; // Извлекаем 5 кадров для упрощения

      try {
        // Используем переданную длительность или получаем из видео
        let duration = videoDuration;
        if (duration === 0) {
          const videoInfo = await new Promise<any>((resolveInfo, rejectInfo) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
              if (err) rejectInfo(err);
              else resolveInfo(metadata);
            });
          });
          duration = videoInfo.format.duration || 30;
        }
        
        const timestamps = Array.from(
          { length: totalFrames },
          (_, i) => Math.floor((i / (totalFrames - 1)) * Math.min(duration, 300)), // Распределяем по всей длительности (макс 5 минут)
        );

        ffmpeg(videoPath)
          .screenshots({
            timestamps: timestamps.map(t => `${t}`),
            filename: 'frame-%s.png',
            folder: outputDir,
          })
          .on('end', async () => {
            // Анализ кадров через Yandex GPT
            try {
              const frameFiles = await fs.readdir(outputDir);
              const framePaths = frameFiles
                .filter((f) => f.endsWith('.png'))
                .slice(0, totalFrames)
                .map((f) => path.join(outputDir, f));

              // Описываем каждый кадр через Yandex Vision API
              for (let i = 0; i < framePaths.length; i++) {
                try {
                  // Читаем изображение в base64 для отправки в Vision API
                  const imageBuffer = fsSync.readFileSync(framePaths[i]);
                  const imageBase64 = imageBuffer.toString('base64');
                  
                  // Анализируем кадр через Yandex Vision API
                  const description = await this.yandexVisionService.describeImage(
                    imageBase64,
                    `Кадр на ${timestamps[i]} секунде видео`,
                  );
                  frames.push(description);
                } catch (error: any) {
                  console.warn(`⚠️ Не удалось описать кадр ${i + 1}:`, error.message);
                  // Fallback на базовое описание
                  frames.push(`Кадр ${i + 1} (${timestamps[i]}с): сцена из видео`);
                }
              }
            } catch (error) {
              console.error('Error processing frames:', error);
            }
            resolve(frames);
          })
          .on('error', (err) => {
            console.error('Error extracting frames:', err);
            // Возвращаем пустой массив если не удалось извлечь кадры
            resolve([]);
          });
      } catch (error) {
        console.error('Error getting video info:', error);
        resolve([]);
      }
    });
  }

  async generateScript(topic: string, stylePassport: any): Promise<string> {
    return await this.yandexGptService.generateScript(topic, stylePassport);
  }

  async generateScriptVariants(topic: string, stylePassport: any, count: number = 3): Promise<string[]> {
    return await this.yandexGptService.generateScriptVariants(topic, stylePassport, count);
  }

  async analyzeHook(hook: string, stylePassport: any): Promise<{ pluses: string[]; minuses: string[]; analysis: string }> {
    return await this.yandexGptService.analyzeHook(hook, stylePassport);
  }

  /**
   * Обрабатывает видео из URL (скачивает через downloader сервис и анализирует)
   */
  async processVideoFromUrl(url: string): Promise<any> {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    // Проверяем поддерживаемую платформу
    const platform = this.downloaderService.detectPlatform(url);
    if (platform === 'unknown') {
      throw new BadRequestException(
        'Неподдерживаемая платформа. Поддерживаются: YouTube, TikTok, Instagram'
      );
    }

    console.log(`📥 Скачиваем и обрабатываем видео: ${url} (платформа: ${platform})`);

    try {
      // Получаем информацию о видео от downloader сервиса
      const downloadResult = await this.downloaderService.downloadVideo(url);
      
      if (!downloadResult.success || !downloadResult.data?.file_path) {
        throw new Error(downloadResult.error || 'Не удалось скачать видео');
      }

      const filePath = downloadResult.data.file_path;
      
      // Проверяем существование файла
      if (!fsSync.existsSync(filePath)) {
        throw new Error('Скачанный файл не найден');
      }

      // Обрабатываем скачанное видео как обычное
      const file = {
        filename: downloadResult.data.filename || path.basename(filePath),
        path: filePath,
      };

      const result = await this.processVideo(file);

      // Удаляем скачанный файл после обработки
      await fs.unlink(filePath).catch(() => {
        // Игнорируем ошибки удаления
      });

      return result;
    } catch (error: any) {
      // Сохраняем оригинальное сообщение об ошибке для более детальной информации
      const errorMessage = error.message || 'Неизвестная ошибка';
      
      // Если ошибка связана с недоступностью downloader сервиса, передаем детальное сообщение
      if (errorMessage.includes('не запущен') || errorMessage.includes('ECONNREFUSED')) {
        throw new BadRequestException(errorMessage);
      }
      
      throw new BadRequestException(
        `Не удалось обработать видео из URL: ${errorMessage}`
      );
    }
  }

  /**
   * Анализирует последние N видео из профиля автора и создает обобщенный паспорт стиля
   */
  async analyzeProfile(profileUrl: string, videosCount: number = 3): Promise<any> {
    if (!profileUrl) {
      throw new BadRequestException('Profile URL is required');
    }

    console.log(`📊 Анализируем профиль: ${profileUrl} (последние ${videosCount} видео)`);

    try {
      // Получаем информацию о профиле (bio, description, links)
      const profileInfoResult = await this.downloaderService.getProfileInfo(profileUrl);
      const profileInfo = profileInfoResult?.success ? profileInfoResult.data : {
        profile_header: '',
        description: '',
        bio: '',
        links: [],
        external_links: false,
        cta_in_bio: '',
      };

      console.log(`📋 Информация о профиле получена:`, {
        description: profileInfo.description?.substring(0, 100) || 'пусто',
        links: profileInfo.links?.length || 0,
      });

      // Получаем список последних видео из профиля
      const profileResult = await this.downloaderService.getProfileVideos(profileUrl, videosCount);
      
      if (!profileResult.success || !profileResult.data?.videos || profileResult.data.videos.length === 0) {
        throw new Error('Не удалось получить список видео из профиля');
      }

      const videos = profileResult.data.videos;
      console.log(`✅ Найдено ${videos.length} видео для анализа`);

      // Анализируем каждое видео
      const analysisResults: any[] = [];
      const transcripts: string[] = [];
      const allFrames: string[] = [];
      const allVisualDescriptions: string[] = [];

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        console.log(`📹 Анализируем видео ${i + 1}/${videos.length}: ${video.title}`);
        
        try {
          // Скачиваем и обрабатываем видео
          const downloadResult = await this.downloaderService.downloadVideo(video.url);
          
          if (!downloadResult.success || !downloadResult.data?.file_path) {
            console.warn(`⚠️ Не удалось скачать видео ${i + 1}, пропускаем`);
            continue;
          }

          const filePath = downloadResult.data.file_path;
          
          if (!fsSync.existsSync(filePath)) {
            console.warn(`⚠️ Файл не найден для видео ${i + 1}, пропускаем`);
            continue;
          }

          // Обрабатываем видео
          const file = {
            filename: downloadResult.data.filename || path.basename(filePath),
            path: filePath,
          };

          const result = await this.processVideo(file);
          
          // Собираем данные для обобщенного анализа
          if (result.transcript) {
            transcripts.push(result.transcript);
          }
          if (result.frames && result.frames.length > 0) {
            allFrames.push(...result.frames);
          }
          if (result.visualDescription) {
            allVisualDescriptions.push(result.visualDescription);
          }
          
          analysisResults.push({
            videoTitle: video.title,
            videoUrl: video.url,
            stylePassport: result.stylePassport,
            transcript: result.transcript,
          });

          // Удаляем скачанный файл
          await fs.unlink(filePath).catch(() => {});
        } catch (error: any) {
          console.error(`❌ Ошибка при анализе видео ${i + 1}:`, error.message);
          // Продолжаем анализ остальных видео
        }
      }

      if (analysisResults.length === 0) {
        throw new Error('Не удалось проанализировать ни одно видео из профиля');
      }

      console.log(`✅ Проанализировано ${analysisResults.length} видео. Создаем обобщенный паспорт стиля...`);

      // Создаем обобщенный паспорт стиля на основе всех видео
      const combinedTranscript = transcripts.join('\n\n---\n\n');
      const combinedVisualDescription = allVisualDescriptions.join('. ');

      const aggregatedStylePassport = await this.yandexGptService.analyzeVideoContent(
        combinedTranscript,
        combinedVisualDescription,
      );

      // Дополнительно анализируем паттерны и общие элементы
      const aggregatedInsights = await this.yandexGptService.analyzeProfilePatterns(
        analysisResults.map(r => r.stylePassport),
      );

      // Анализируем шапку профиля отдельно
      const profileHeaderAnalysis = await this.yandexGptService.analyzeProfileHeader(
        profileInfo.profile_header || profileInfo.description || '',
      );

      // Анализируем описание профиля
      const profileAnalysis = await this.yandexGptService.analyzeProfileDescription(
        profileInfo.description || '',
        profileInfo.bio || '',
        profileInfo.links || [],
        profileInfo.cta_in_bio || '',
      );

      // Создаем анализ ДНК профиля (структурированный формат)
      const dnaAnalysis = {
        structuralPatterns: aggregatedInsights.structuralPatterns || [],
        speechFormula: aggregatedInsights.speechFormula || {},
        consistency: aggregatedInsights.consistency || [],
        variability: aggregatedInsights.variability || [],
        productConclusion: aggregatedInsights.productConclusion || 'Это не отдельные видео, а воспроизводимая формула автора.',
        dnaUsage: aggregatedInsights.dnaUsage || [],
      };

      return {
        profileUrl,
        videosAnalyzed: analysisResults.length,
        videos: analysisResults.map(r => ({
          title: r.videoTitle,
          url: r.videoUrl,
        })),
        profileDescription: {
          header: profileInfo.profile_header || profileInfo.description || 'не указано',
          original: profileInfo.description || profileInfo.bio || 'не указано',
          bio: profileInfo.bio || 'не указано',
          links: profileInfo.links || [],
        },
        profileHeaderAnalysis,
        profileAnalysis,
        aggregatedStylePassport: {
          ...aggregatedStylePassport,
          insights: {
            ...aggregatedStylePassport.insights,
            ...aggregatedInsights,
          },
        },
        dnaAnalysis,
        individualResults: analysisResults,
      };
    } catch (error: any) {
      console.error('Error analyzing profile:', error);
      throw new BadRequestException(
        `Не удалось проанализировать профиль: ${error.message}`
      );
    }
  }
}
