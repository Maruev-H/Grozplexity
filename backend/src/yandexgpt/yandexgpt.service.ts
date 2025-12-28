import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class YandexGptService {
  private apiKey: string;
  private folderId: string;
  private axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('YANDEX_API_KEY') || '';
    this.folderId = this.configService.get<string>('YANDEX_FOLDER_ID') || '';

    if (!this.apiKey) {
      throw new Error('YANDEX_API_KEY is not set in environment variables');
    }
    if (!this.folderId) {
      throw new Error('YANDEX_FOLDER_ID is not set in environment variables');
    }

    this.axiosInstance = axios.create({
      baseURL: 'https://llm.api.cloud.yandex.net/foundationModels/v1',
      headers: {
        'Authorization': `Api-Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 секунд таймаут для запросов к Yandex GPT
    });
  }

  async analyzeVideoContent(transcript: string, visualDescription?: string): Promise<any> {
    console.log({
      transcript, visualDescription
    });
    
    const prompt = `Проанализируй видео-контент и создай "Паспорт стиля" автора.

Транскрипция видео:
${transcript}

${visualDescription ? `Визуальное описание: ${visualDescription}` : ''}

КРИТИЧЕСКИ ВАЖНО: Верни ТОЛЬКО валидный JSON без дополнительного текста, комментариев или объяснений. Начни сразу с { и закончи }. Все поля должны быть заполнены конкретными значениями на основе анализа. НЕ используй "Не определено", "неизвестно" или пустые значения.

Требуемая структура JSON (заполни ВСЕ поля конкретными значениями):
{
  "structure": {
    "hook": "детальное описание хука (первые 5-10 секунд видео) - обязательно заполни конкретным описанием",
    "setup": "детальное описание завязки - обязательно заполни конкретным описанием",
    "main": "детальное описание основной части - обязательно заполни конкретным описанием",
    "climax": "детальное описание кульминации - обязательно заполни конкретным описанием",
    "cta": "детальное описание призыва к действию - обязательно заполни конкретным описанием"
  },
  "toneOfVoice": {
    "speechRate": "конкретная скорость речи в словах в минуту (например: 150 слов/мин) - обязательно заполни",
    "typicalPhrases": ["конкретная фраза 1 из видео", "конкретная фраза 2 из видео", "конкретная фраза 3 из видео"],
    "emotionalTone": "конкретная эмоциональная окраска (агрессивно/познавательно/смешно/дружелюбно и т.д.) - обязательно заполни",
    "style": "конкретный общий стиль речи - обязательно заполни"
  },
  "visualContext": {
    "setting": "конкретное место действия - обязательно заполни",
    "pacing": "конкретный темп визуала (динамичный/статичный) - обязательно заполни",
    "keyElements": ["конкретный элемент 1", "конкретный элемент 2"]
  },
  "insights": {
    "retentionHooks": ["конкретный крючок 1", "конкретный крючок 2"],
    "patterns": ["конкретный паттерн 1", "конкретный паттерн 2"],
    "uniqueElements": ["конкретный элемент 1", "конкретный элемент 2"]
  }
}

Начни ответ сразу с { без предисловий. Все поля должны быть заполнены конкретными значениями на основе анализа транскрипции.`;

    try {
      const response = await this.axiosInstance.post('/completion', {
        modelUri: `gpt://${this.folderId}/yandexgpt/latest`,
        completionOptions: {
          stream: false,
          temperature: 0.7,
          maxTokens: 4000,
        },
        messages: [
          {
            role: 'system',
            text: 'Ты эксперт по анализу видео-контента. Всегда возвращай валидный JSON без дополнительного текста.',
          },
          {
            role: 'user',
            text: prompt,
          },
        ],
      }, {
        timeout: 90000, // 90 секунд для анализа контента
      });

      const text = response.data.result?.alternatives?.[0]?.message?.text || '{}';
      
      console.log('🔍 Yandex GPT raw response:', JSON.stringify(response.data, null, 2));
      console.log('📝 Extracted text:', text);
      console.log('📏 Text length:', text.length);
      console.log('📏 Is text empty?', !text || text === '{}' || text.trim().length === 0);

      // Извлекаем JSON из ответа
      let parsedData: any;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        } else {
          parsedData = JSON.parse(text);
        }
        
        console.log('✅ Parsed JSON:', JSON.stringify(parsedData, null, 2));
        
        // Проверяем структуру и заполняем недостающие поля
        if (!parsedData || typeof parsedData !== 'object') {
          throw new Error('Parsed data is not an object');
        }
        
        // Заполняем структуру
        if (!parsedData.structure || typeof parsedData.structure !== 'object') {
          parsedData.structure = {};
        }
        parsedData.structure.hook = parsedData.structure.hook || 'Не определено';
        parsedData.structure.setup = parsedData.structure.setup || 'Не определено';
        parsedData.structure.main = parsedData.structure.main || 'Не определено';
        parsedData.structure.climax = parsedData.structure.climax || 'Не определено';
        parsedData.structure.cta = parsedData.structure.cta || 'Не определено';
        
        // Заполняем toneOfVoice
        if (!parsedData.toneOfVoice || typeof parsedData.toneOfVoice !== 'object') {
          parsedData.toneOfVoice = {};
        }
        parsedData.toneOfVoice.speechRate = parsedData.toneOfVoice.speechRate || 'Не определено';
        parsedData.toneOfVoice.typicalPhrases = Array.isArray(parsedData.toneOfVoice.typicalPhrases) 
          ? parsedData.toneOfVoice.typicalPhrases 
          : [];
        parsedData.toneOfVoice.emotionalTone = parsedData.toneOfVoice.emotionalTone || 'Не определено';
        parsedData.toneOfVoice.style = parsedData.toneOfVoice.style || 'Не определено';
        
        // Заполняем visualContext
        if (!parsedData.visualContext || typeof parsedData.visualContext !== 'object') {
          parsedData.visualContext = {};
        }
        parsedData.visualContext.setting = parsedData.visualContext.setting || 'Не определено';
        parsedData.visualContext.pacing = parsedData.visualContext.pacing || 'Не определено';
        parsedData.visualContext.keyElements = Array.isArray(parsedData.visualContext.keyElements)
          ? parsedData.visualContext.keyElements
          : [];
        
        // Заполняем insights
        if (!parsedData.insights || typeof parsedData.insights !== 'object') {
          parsedData.insights = {};
        }
        parsedData.insights.retentionHooks = Array.isArray(parsedData.insights.retentionHooks)
          ? parsedData.insights.retentionHooks
          : [];
        parsedData.insights.patterns = Array.isArray(parsedData.insights.patterns)
          ? parsedData.insights.patterns
          : [];
        parsedData.insights.uniqueElements = Array.isArray(parsedData.insights.uniqueElements)
          ? parsedData.insights.uniqueElements
          : [];
        
        console.log('✅ Final parsed data with defaults:', JSON.stringify(parsedData, null, 2));
        return parsedData;
      } catch (parseError: any) {
        console.error('❌ Error parsing JSON from Yandex GPT:', parseError);
        console.error('📄 Raw text that failed to parse:', text);
        console.error('📄 Text length:', text.length);
        console.error('📄 Text substring (first 500 chars):', text.substring(0, 500));
        // Возвращаем структуру по умолчанию если парсинг не удался
        return {
          structure: {
            hook: 'Ошибка парсинга ответа',
            setup: 'Ошибка парсинга ответа',
            main: 'Ошибка парсинга ответа',
            climax: 'Ошибка парсинга ответа',
            cta: 'Ошибка парсинга ответа',
          },
          toneOfVoice: {
            speechRate: 'Ошибка парсинга',
            typicalPhrases: [],
            emotionalTone: 'Ошибка парсинга',
            style: 'Ошибка парсинга',
          },
          visualContext: {
            setting: 'Ошибка парсинга',
            pacing: 'Ошибка парсинга',
            keyElements: [],
          },
          insights: {
            retentionHooks: [],
            patterns: [],
            uniqueElements: [],
          },
        };
      }
    } catch (error: any) {
      console.error('Error analyzing video content:', error);
      
      // Обработка сетевых ошибок
      if (error.code === 'ETIMEDOUT' || error.code === 'ENETUNREACH' || error.code === 'ECONNREFUSED') {
        throw new Error(
          'Ошибка подключения к Yandex GPT API. Проверьте интернет-соединение и доступность сервиса. ' +
          'Попробуйте повторить запрос через несколько секунд.',
        );
      }
      
      // Обработка ошибок аутентификации
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        const errorDetails = error?.response?.data?.error?.message || error?.message || '';
        const errorMessage = 
          `Ошибка аутентификации Yandex GPT (401/403). Проверьте:\n` +
          `1. YANDEX_API_KEY - правильность ключа\n` +
          `2. YANDEX_FOLDER_ID - правильность ID каталога (не сервисного аккаунта!)\n` +
          `3. Роль сервисного аккаунта - должна быть ai.languageModels.user\n` +
          `4. Сервисный аккаунт должен быть в том же каталоге, что указан в YANDEX_FOLDER_ID\n` +
          (errorDetails ? `Детали: ${errorDetails}` : '');
        throw new Error(errorMessage);
      }
      if (error?.response?.status === 429) {
        throw new Error(
          'Превышен лимит запросов Yandex GPT. Попробуйте позже или увеличьте лимит.',
        );
      }
      
      throw new Error(`Failed to analyze video content: ${error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'Unknown error'}`);
    }
  }

  async generateScript(topic: string, stylePassport: any): Promise<string> {
    const prompt = `Создай посекундный сценарий для нового видео на тему "${topic}".

Используй следующий "Паспорт стиля" автора ТОЛЬКО для стиля и структуры, НО создавай НОВЫЙ контент на тему "${topic}":
${JSON.stringify(stylePassport, null, 2)}

КРИТИЧЕСКИ ВАЖНО:
1. ТЕМА видео: "${topic}" - создавай контент ИМЕННО на эту тему, а не на тему из паспорта стиля!
2. СТИЛЬ автора: используй структуру, темп речи, эмоциональную окраску и типичные фразы из паспорта стиля
3. НЕ копируй содержание из паспорта стиля - это был анализ ДРУГОГО видео
4. Создай ПОЛНОСТЬЮ НОВЫЙ контент на тему "${topic}", но в стиле автора

Структура должна соответствовать паспорту стиля:
- Хук: ${stylePassport.structure?.hook || 'начни с интригующего вопроса/утверждения'}
- Завязка: ${stylePassport.structure?.setup || 'представь тему'}
- Основная часть: ${stylePassport.structure?.main || 'раскрой тему подробно'}
- Кульминация: ${stylePassport.structure?.climax || 'создай кульминацию'}
- CTA: ${stylePassport.structure?.cta || 'призыв к действию'}

Используй типичные фразы автора: ${stylePassport.toneOfVoice?.typicalPhrases?.join(', ') || 'используй стиль автора'}
Темп речи: ${stylePassport.toneOfVoice?.speechRate || '150 слов/мин'}
Эмоциональная окраска: ${stylePassport.toneOfVoice?.emotionalTone || 'познавательно'}

Формат вывода:
[00:00-00:05]
Кадр: (описание визуала в стиле автора)
Текст: (Хук в стиле автора на тему "${topic}")

[00:05-00:15]
Кадр: (описание визуала)
Текст: (текст в стиле автора на тему "${topic}")

...и так далее до 60 секунд

Создай сценарий длительностью 60 секунд, разбитый на сегменты по 5-10 секунд. ВСЁ содержание должно быть на тему "${topic}", а не на тему из паспорта стиля!`;

    try {
      const response = await this.axiosInstance.post('/completion', {
        modelUri: `gpt://${this.folderId}/yandexgpt/latest`,
        completionOptions: {
          stream: false,
          temperature: 0.8,
          maxTokens: 4000,
        },
        messages: [
          {
            role: 'system',
            text: 'Ты профессиональный сценарист для коротких видео. Создавай креативные и увлекательные сценарии.',
          },
          {
            role: 'user',
            text: prompt,
          },
        ],
      }, {
        timeout: 90000, // 90 секунд для генерации сценария (может быть долгим)
      });

      return response.data.result?.alternatives?.[0]?.message?.text || 'Не удалось сгенерировать сценарий';
    } catch (error: any) {
      console.error('Error generating script:', error);
      
      // Обработка сетевых ошибок
      if (error.code === 'ETIMEDOUT' || error.code === 'ENETUNREACH' || error.code === 'ECONNREFUSED') {
        throw new Error(
          'Ошибка подключения к Yandex GPT API. Проверьте интернет-соединение и доступность сервиса. ' +
          'Попробуйте повторить запрос через несколько секунд.',
        );
      }
      
      // Обработка ошибок аутентификации
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        const errorDetails = error?.response?.data?.error?.message || error?.message || '';
        const errorMessage = 
          `Ошибка аутентификации Yandex GPT (401/403). Проверьте:\n` +
          `1. YANDEX_API_KEY - правильность ключа\n` +
          `2. YANDEX_FOLDER_ID - правильность ID каталога (не сервисного аккаунта!)\n` +
          `3. Роль сервисного аккаунта - должна быть ai.languageModels.user\n` +
          (errorDetails ? `Детали: ${errorDetails}` : '');
        throw new Error(errorMessage);
      }
      if (error?.response?.status === 429) {
        throw new Error(
          'Превышен лимит запросов Yandex GPT. Попробуйте позже или увеличьте лимит.',
        );
      }
      
      throw new Error(`Failed to generate script: ${error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'Unknown error'}`);
    }
  }

  async analyzeVisualContext(videoFrames: string[]): Promise<string> {
    if (!videoFrames || videoFrames.length === 0) {
      return 'Визуальный контекст не доступен';
    }

    const prompt = `Проанализируй визуальный контекст видео на основе описаний кадров:

${videoFrames.map((frame, i) => `Кадр ${i + 1}: ${frame}`).join('\n')}

Опиши:
1. Где происходит действие (setting)
2. Темп визуала (динамичный/статичный)
3. Ключевые визуальные элементы
4. Стиль съемки

Верни краткое описание в 2-3 предложениях.`;

    try {
      const response = await this.axiosInstance.post('/completion', {
        modelUri: `gpt://${this.folderId}/yandexgpt/latest`,
        completionOptions: {
          stream: false,
          temperature: 0.7,
          maxTokens: 1000,
        },
        messages: [
          {
            role: 'system',
            text: 'Ты эксперт по визуальному анализу видео-контента.',
          },
          {
            role: 'user',
            text: prompt,
          },
        ],
      }, {
        timeout: 30000, // 30 секунд для анализа визуального контекста
      });

      return response.data.result?.alternatives?.[0]?.message?.text || 'Не удалось проанализировать визуальный контекст';
    } catch (error: any) {
      // Логируем только если это не сетевая ошибка
      if (error.code !== 'ETIMEDOUT' && error.code !== 'ENETUNREACH' && error.code !== 'ECONNREFUSED') {
        console.error('Error analyzing visual context:', error);
      } else {
        console.warn(`⚠️ Сетевая ошибка при анализе визуального контекста: ${error.code}`);
      }
      
      // Обработка ошибок
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        console.warn('⚠️ Ошибка аутентификации Yandex GPT для анализа визуального контекста');
        console.warn('Проверьте роль ai.languageModels.user у сервисного аккаунта');
        return 'Визуальный контекст не доступен (ошибка аутентификации - проверьте роли сервисного аккаунта)';
      }
      if (error?.response?.status === 429) {
        console.warn('⚠️ Превышен лимит запросов Yandex GPT для анализа визуального контекста');
        return 'Визуальный контекст не доступен (превышен лимит запросов)';
      }
      
      return 'Не удалось проанализировать визуальный контекст';
    }
  }

  async enhanceFrameDescription(visionDescription: string, context: string = ''): Promise<string> {
    // Улучшаем описание кадра от Vision API через GPT для более детального анализа
    const prompt = `На основе технического анализа кадра создай детальное описание для анализа видео-контента.

Технический анализ от Vision API:
${visionDescription}

${context ? `Контекст: ${context}` : ''}

Создай описание, которое включает:
1. Что происходит в кадре (действие, сцена)
2. Основные объекты и элементы
3. Настроение и атмосферу
4. Визуальный стиль (цвета, освещение, композиция)

Верни краткое, но информативное описание в 2-3 предложениях.`;

    try {
      const response = await this.axiosInstance.post('/completion', {
        modelUri: `gpt://${this.folderId}/yandexgpt/latest`,
        completionOptions: {
          stream: false,
          temperature: 0.7,
          maxTokens: 200,
        },
        messages: [
          {
            role: 'system',
            text: 'Ты эксперт по визуальному анализу видео-контента. Создавай детальные и точные описания кадров.',
          },
          {
            role: 'user',
            text: prompt,
          },
        ],
      }, {
        timeout: 30000, // 30 секунд для улучшения описания кадра
      });

      return response.data.result?.alternatives?.[0]?.message?.text || visionDescription;
    } catch (error: any) {
      // Логируем только если это не сетевая ошибка (чтобы не засорять логи)
      if (error.code !== 'ETIMEDOUT' && error.code !== 'ENETUNREACH' && error.code !== 'ECONNREFUSED') {
        console.error('Error enhancing frame description:', error);
      } else {
        console.warn(`⚠️ Сетевая ошибка при улучшении описания кадра: ${error.code}. Используем исходное описание от Vision API.`);
      }
      // Возвращаем исходное описание от Vision API при любой ошибке
      return visionDescription;
    }
  }
}

