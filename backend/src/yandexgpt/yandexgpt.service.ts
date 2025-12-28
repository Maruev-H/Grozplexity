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

  async generateScript(topic: string, stylePassport: any, variant?: number): Promise<string> {
    const variantText = variant ? ` (Вариант ${variant})` : '';
    const prompt = `Создай посекундный сценарий для нового видео на тему "${topic}"${variantText}.

Используй следующий "Паспорт стиля" автора ТОЛЬКО для стиля и структуры, НО создавай НОВЫЙ контент на тему "${topic}":
${JSON.stringify(stylePassport, null, 2)}

КРИТИЧЕСКИ ВАЖНО:
1. ТЕМА видео: "${topic}" - создавай контент ИМЕННО на эту тему, а не на тему из паспорта стиля!
2. СТИЛЬ автора: используй структуру, темп речи, эмоциональную окраску и типичные фразы из паспорта стиля
3. НЕ копируй содержание из паспорта стиля - это был анализ ДРУГОГО видео
4. Создай ПОЛНОСТЬЮ НОВЫЙ контент на тему "${topic}", но в стиле автора
5. СЦЕНАРИЙ ДОЛЖЕН БЫТЬ ЖИВЫМ И ЕСТЕСТВЕННЫМ - используй разговорный стиль, сленг, эмоции, как в оригинале
6. НЕ делай сценарий стерильным или формальным - он должен быть дерзким, сырым, живым, как оригинальное видео автора
${variant ? '7. Создай УНИКАЛЬНЫЙ вариант сценария, отличающийся от других вариантов подходом, углом подачи или структурой' : ''}

СТИЛЬ ПОДАЧИ:
- Используй разговорный язык, как в оригинале
- Добавь эмоции, экспрессию, живые выражения
- Не бойся использовать сленг, жаргон, неформальные выражения
- Сценарий должен звучать естественно, как живая речь, а не как заученный текст
- Сохрани дерзость и "сырость" оригинального стиля автора

Структура должна соответствовать паспорту стиля:
- Хук: ${stylePassport.structure?.hook || 'начни с интригующего вопроса/утверждения'}
- Завязка: ${stylePassport.structure?.setup || 'представь тему'}
- Основная часть: ${stylePassport.structure?.main || 'раскрой тему подробно'}
- Кульминация: ${stylePassport.structure?.climax || 'создай кульминацию'}
- CTA: ${stylePassport.structure?.cta || 'призыв к действию'}

Используй типичные фразы автора: ${stylePassport.toneOfVoice?.typicalPhrases?.join(', ') || 'используй стиль автора'}
Темп речи: ${stylePassport.toneOfVoice?.speechRate || '150 слов/мин'}
Эмоциональная окраска: ${stylePassport.toneOfVoice?.emotionalTone || 'познавательно'}
Стиль речи: ${stylePassport.toneOfVoice?.style || 'естественный'}

Формат вывода:
[00:00-00:05]
Кадр: (описание визуала в стиле автора)
Текст: (Хук в стиле автора на тему "${topic}" - живой, дерзкий, естественный)

[00:05-00:15]
Кадр: (описание визуала)
Текст: (текст в стиле автора на тему "${topic}" - разговорный, эмоциональный)

...и так далее до 60 секунд

Создай сценарий длительностью 60 секунд, разбитый на сегменты по 5-10 секунд. ВСЁ содержание должно быть на тему "${topic}", но в живом, естественном, дерзком стиле автора, как в оригинале!`;

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
            text: 'Ты профессиональный сценарист для коротких видео. Создавай живые, естественные, дерзкие сценарии в стиле который отправляет пользователь. Не делай их стерильными или формальными - они должны звучать как живая речь, с эмоциями, сленгом и экспрессией.',
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

  /**
   * Генерирует несколько вариантов сценариев (A/B тестирование)
   */
  async generateScriptVariants(topic: string, stylePassport: any, count: number = 3): Promise<string[]> {
    const variants: string[] = [];
    
    // Генерируем варианты последовательно для стабильности
    for (let i = 1; i <= count; i++) {
      try {
        const variant = await this.generateScript(topic, stylePassport, i);
        variants.push(variant);
      } catch (error: any) {
        console.error(`Error generating variant ${i}:`, error);
        // Если один вариант не удался, продолжаем с остальными
        variants.push(`Ошибка генерации варианта ${i}: ${error.message}`);
      }
    }
    
    return variants;
  }

  /**
   * Анализирует хук и объясняет, почему он работает (с плюсами и минусами)
   */
  async analyzeHook(hook: string, stylePassport: any): Promise<{ pluses: string[]; minuses: string[]; analysis: string }> {
    const prompt = `Проанализируй следующий хук из видео и объясни его эффективность с плюсами и минусами.

Хук: "${hook}"

Контекст стиля автора:
- Типичные фразы: ${stylePassport.toneOfVoice?.typicalPhrases?.join(', ') || 'не указаны'}
- Эмоциональная окраска: ${stylePassport.toneOfVoice?.emotionalTone || 'не указана'}
- Стиль речи: ${stylePassport.toneOfVoice?.style || 'не указан'}
- Крючки удержания из анализа: ${stylePassport.insights?.retentionHooks?.join(', ') || 'не указаны'}

Верни ТОЛЬКО валидный JSON без дополнительного текста:
{
  "pluses": ["плюс 1", "плюс 2", "плюс 3"],
  "minuses": ["минус 1", "минус 2"],
  "analysis": "краткий анализ эффективности хука (2-3 предложения)"
}

Плюсы должны включать:
- Психологические триггеры (любопытство, эмоции, интрига)
- Соответствие стилю автора
- Элементы, которые цепляют внимание
- Сильные стороны хука

Минусы должны включать:
- Потенциальные слабые стороны
- Риски (если есть)
- Что можно улучшить

Начни ответ сразу с { без предисловий.`;

    try {
      const response = await this.axiosInstance.post('/completion', {
        modelUri: `gpt://${this.folderId}/yandexgpt/latest`,
        completionOptions: {
          stream: false,
          temperature: 0.7,
          maxTokens: 500,
        },
        messages: [
          {
            role: 'system',
            text: 'Ты эксперт по анализу видео-контента и психологии удержания внимания. Анализируй хуки и объясняй их эффективность.',
          },
          {
            role: 'user',
            text: prompt,
          },
        ],
      }, {
        timeout: 30000, // 30 секунд для анализа хука
      });

      const text = response.data.result?.alternatives?.[0]?.message?.text || '{}';
      
      // Парсим JSON ответ
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
        
        // Проверяем и заполняем структуру
        return {
          pluses: Array.isArray(parsedData.pluses) ? parsedData.pluses : [],
          minuses: Array.isArray(parsedData.minuses) ? parsedData.minuses : [],
          analysis: parsedData.analysis || 'Анализ хука недоступен',
        };
      } catch (parseError: any) {
        console.error('Error parsing hook analysis JSON:', parseError);
        // Возвращаем структуру по умолчанию
        return {
          pluses: ['Хук использует интригу для привлечения внимания'],
          minuses: [],
          analysis: 'Хук эффективен для удержания внимания зрителя',
        };
      }
    } catch (error: any) {
      console.error('Error analyzing hook:', error);
      
      if (error.code === 'ETIMEDOUT' || error.code === 'ENETUNREACH' || error.code === 'ECONNREFUSED') {
        throw new Error(
          'Ошибка подключения к Yandex GPT API. Проверьте интернет-соединение.',
        );
      }
      
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        throw new Error('Ошибка аутентификации Yandex GPT.');
      }
      if (error?.response?.status === 429) {
        throw new Error('Превышен лимит запросов Yandex GPT. Попробуйте позже.');
      }
      
      // Возвращаем структуру по умолчанию при ошибке
      return {
        pluses: ['Хук использует интригу для привлечения внимания'],
        minuses: [],
        analysis: 'Анализ хука недоступен из-за ошибки API',
      };
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

  /**
   * Анализирует паттерны и общие элементы из нескольких паспортов стиля
   * Возвращает структурированную ДНК-формулу автора
   */
  async analyzeProfilePatterns(stylePassports: any[]): Promise<any> {
    if (!stylePassports || stylePassports.length === 0) {
      return {
        structuralPatterns: [],
        speechFormula: {},
        consistency: [],
        variability: [],
        productConclusion: '',
        dnaUsage: [],
      };
    }

    const videosCount = stylePassports.length;
    const countLabel = `(${videosCount}/${videosCount})`;

    const prompt = `Проанализируй ${videosCount} "Паспортов стиля" одного автора и извлеки МАШИННО-ИЗВЛЕЧЁННУЮ ДНК-ФОРМУЛУ.

Паспорты стиля:
${JSON.stringify(stylePassports, null, 2)}

КРИТИЧЕСКИ ВАЖНО:
1. НЕ используй слова: "интересно", "уникально", "переходит", "эволюция", "различный", "меняется", "зависит от темы"
2. ВСЁ должно быть измеримо и повторяемо
3. Используй формат (X/${videosCount}) для повторяемости
4. НЕ выдумывай данные - только то, что реально повторяется
5. НЕ делай вывод про "эволюцию" (${videosCount} видео - мало)
6. Пиши кратко, жёстко, структурно
7. Вариативность допустима ТОЛЬКО в теме, НЕ в структуре
8. Используй диапазоны и чёткие ограничения

Верни ТОЛЬКО валидный JSON без дополнительного текста:
{
  "structuralPatterns": [
    "Хук появляется в первые X-Y секунд (${videosCount}/${videosCount})",
    "После хука всегда идёт [конкретное действие] (${videosCount}/${videosCount})",
    "Финал [конкретное действие] (${videosCount}/${videosCount})",
    "CTA: [тип CTA] (${videosCount}/${videosCount})"
  ],
  "speechFormula": {
    "speedRange": "X-Y слов/мин",
    "speedVariation": "<X%",
    "emotionalTone": "[конкретный тон], допускает вариации, но без выхода за рамки [ограничение]",
    "personalFormulations": "есть во всех видео (${videosCount}/${videosCount}) / отсутствует"
  },
  "consistency": [
    "Структура повторяется: [конкретная последовательность] (${videosCount}/${videosCount})",
    "Темп речи стабилен (разброс <X%)",
    "[Другая консистентная характеристика с цифрами]"
  ],
  "variability": [
    "Вариативность допустима ТОЛЬКО в теме, НЕ в структуре",
    "[Что стабильно] - стабильно (${videosCount}/${videosCount})",
    "[Что меняется] - меняется, но в пределах [диапазон/ограничение]"
  ],
  "productConclusion": "Это не отдельные видео, а воспроизводимая формула автора.",
  "dnaUsage": [
    "При генерации нового сценария мы ОБЯЗАНЫ делать хук ≤ 5 секунд",
    "При генерации мы ОБЯЗАНЫ использовать [конкретную характеристику из speechFormula]",
    "При генерации мы ОБЯЗАНЫ избегать [что запрещено]",
    "При генерации мы ОБЯЗАНЫ [конкретное правило из structuralPatterns]",
    "Структура видео должна соответствовать выявленной формуле (${videosCount}/${videosCount})"
  ]
}

Начни ответ сразу с { без предисловий.`;

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
            text: 'Ты AI-аналитик, который извлекает машинно-извлечённую ДНК-формулу автора из видео. Ты НЕ пишешь литературные описания. Ты выдаёшь только измеримые, повторяемые паттерны с цифрами, процентами и форматом (X/N). Запрещено использовать слова: "интересно", "уникально", "переходит", "эволюция".',
          },
          {
            role: 'user',
            text: prompt,
          },
        ],
      }, {
        timeout: 30000,
      });

      const text = response.data.result?.alternatives?.[0]?.message?.text || '{}';
      
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
        
        return {
          structuralPatterns: Array.isArray(parsedData.structuralPatterns) ? parsedData.structuralPatterns : [],
          speechFormula: parsedData.speechFormula || {},
          consistency: Array.isArray(parsedData.consistency) ? parsedData.consistency : [],
          variability: Array.isArray(parsedData.variability) ? parsedData.variability : [],
          productConclusion: parsedData.productConclusion || 'Это не отдельные видео, а воспроизводимая формула автора.',
          dnaUsage: Array.isArray(parsedData.dnaUsage) ? parsedData.dnaUsage : [],
        };
      } catch (parseError: any) {
        console.error('Error parsing profile patterns JSON:', parseError);
        return {
          structuralPatterns: [],
          speechFormula: {},
          consistency: [],
          variability: [],
          productConclusion: 'Это не отдельные видео, а воспроизводимая формула автора.',
          dnaUsage: [],
        };
      }
    } catch (error: any) {
      console.error('Error analyzing profile patterns:', error);
      return {
        structuralPatterns: [],
        speechFormula: {},
        consistency: [],
        variability: [],
        productConclusion: 'Это не отдельные видео, а воспроизводимая формула автора.',
        dnaUsage: [],
      };
    }
  }

  /**
   * Анализирует описание профиля автора и извлекает структурированную информацию
   */
  async analyzeProfileDescription(profileDescription: string, profileBio: string, profileLinks: string[], ctaInBio: string): Promise<any> {
    if (!profileDescription && !profileBio) {
      return {
        hasExternalLinks: false,
        repeatingCtaInHeader: 'не обнаружено',
        ctaType: 'не обнаружено',
        consistency: 'не обнаружено',
        profileAsExtension: false,
      };
    }

    const prompt = `Проанализируй описание профиля автора и извлеки структурированную информацию.

ОПИСАНИЕ ПРОФИЛЯ:
${profileDescription || profileBio || 'не указано'}

BIO:
${profileBio || 'не указано'}

НАЙДЕННЫЕ ССЫЛКИ:
${profileLinks.length > 0 ? profileLinks.join('\n') : 'не обнаружено'}

CTA В BIO:
${ctaInBio || 'не обнаружено'}

КРИТИЧЕСКИ ВАЖНО:
1. НЕ выдумывай данные - только то, что реально есть
2. Если данных нет, пиши "не обнаружено"
3. Пиши кратко, жёстко, структурно
4. НЕ используй литературные описания

Верни ТОЛЬКО валидный JSON без дополнительного текста:
{
  "hasExternalLinks": true/false,
  "repeatingCtaInHeader": "[конкретный CTA из шапки или 'не обнаружено']",
  "ctaType": "внешний (уводит трафик) / внутренний / не обнаружено",
  "consistency": "CTA в видео совпадает с CTA в профиле (да / нет / не обнаружено)",
  "profileAsExtension": true/false
}

Начни ответ сразу с { без предисловий.`;

    try {
      const response = await this.axiosInstance.post('/completion', {
        modelUri: `gpt://${this.folderId}/yandexgpt/latest`,
        completionOptions: {
          stream: false,
          temperature: 0.3,
          maxTokens: 500,
        },
        messages: [
          {
            role: 'system',
            text: 'Ты AI-аналитик, который извлекает структурированную информацию из описания профиля. Ты НЕ пишешь литературные описания. Ты выдаёшь только факты. Если данных нет, ты пишешь "не обнаружено".',
          },
          {
            role: 'user',
            text: prompt,
          },
        ],
      }, {
        timeout: 20000,
      });

      const text = response.data.result?.alternatives?.[0]?.message?.text || '{}';
      
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
        
        return {
          hasExternalLinks: parsedData.hasExternalLinks === true,
          repeatingCtaInHeader: parsedData.repeatingCtaInHeader || 'не обнаружено',
          ctaType: parsedData.ctaType || 'не обнаружено',
          consistency: parsedData.consistency || 'не обнаружено',
          profileAsExtension: parsedData.profileAsExtension === true,
        };
      } catch (parseError: any) {
        console.error('Error parsing profile description JSON:', parseError);
        return {
          hasExternalLinks: profileLinks.length > 0,
          repeatingCtaInHeader: ctaInBio || 'не обнаружено',
          ctaType: profileLinks.length > 0 ? 'внешний (уводит трафик)' : 'не обнаружено',
          consistency: 'не обнаружено',
          profileAsExtension: false,
        };
      }
    } catch (error: any) {
      console.error('Error analyzing profile description:', error);
      return {
        hasExternalLinks: profileLinks.length > 0,
        repeatingCtaInHeader: ctaInBio || 'не обнаружено',
        ctaType: profileLinks.length > 0 ? 'внешний (уводит трафик)' : 'не обнаружено',
        consistency: 'не обнаружено',
        profileAsExtension: false,
      };
    }
  }

  /**
   * Анализирует шапку профиля автора отдельно
   */
  async analyzeProfileHeader(profileHeader: string): Promise<any> {
    if (!profileHeader || profileHeader.trim().length === 0) {
      return {
        headerText: 'не указано',
        analysis: 'Шапка профиля отсутствует или пуста',
      };
    }

    const prompt = `Проанализируй шапку профиля автора и извлеки структурированную информацию.

ШАПКА ПРОФИЛЯ:
${profileHeader}

КРИТИЧЕСКИ ВАЖНО:
1. НЕ выдумывай данные - только то, что реально есть
2. Если данных нет, пиши "не обнаружено"
3. Пиши кратко, жёстко, структурно
4. НЕ используй литературные описания
5. Фокусируйся на CTA, ключевых словах, структуре

Верни ТОЛЬКО валидный JSON без дополнительного текста:
{
  "headerText": "[полный текст шапки]",
  "keyWords": ["ключевое слово 1", "ключевое слово 2"],
  "hasCta": true/false,
  "ctaText": "[текст CTA или 'не обнаружено']",
  "structure": "[одно предложение о структуре шапки]",
  "analysis": "[краткий анализ: что делает шапка, какую роль играет]"
}

Начни ответ сразу с { без предисловий.`;

    try {
      const response = await this.axiosInstance.post('/completion', {
        modelUri: `gpt://${this.folderId}/yandexgpt/latest`,
        completionOptions: {
          stream: false,
          temperature: 0.3,
          maxTokens: 400,
        },
        messages: [
          {
            role: 'system',
            text: 'Ты AI-аналитик, который анализирует шапки профилей. Ты НЕ пишешь литературные описания. Ты выдаёшь только факты и структурированный анализ.',
          },
          {
            role: 'user',
            text: prompt,
          },
        ],
      }, {
        timeout: 20000,
      });

      const text = response.data.result?.alternatives?.[0]?.message?.text || '{}';
      
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
        
        return {
          headerText: parsedData.headerText || profileHeader,
          keyWords: Array.isArray(parsedData.keyWords) ? parsedData.keyWords : [],
          hasCta: parsedData.hasCta === true,
          ctaText: parsedData.ctaText || 'не обнаружено',
          structure: parsedData.structure || 'не указано',
          analysis: parsedData.analysis || 'Анализ недоступен',
        };
      } catch (parseError: any) {
        console.error('Error parsing profile header JSON:', parseError);
        return {
          headerText: profileHeader,
          keyWords: [],
          hasCta: false,
          ctaText: 'не обнаружено',
          structure: 'не указано',
          analysis: 'Ошибка анализа',
        };
      }
    } catch (error: any) {
      console.error('Error analyzing profile header:', error);
      return {
        headerText: profileHeader,
        keyWords: [],
        hasCta: false,
        ctaText: 'не обнаружено',
        structure: 'не указано',
        analysis: 'Ошибка анализа',
      };
    }
  }
}

