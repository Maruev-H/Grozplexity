# Быстрый старт

## 1. Установка зависимостей

```bash
# В корне проекта
npm install

# Backend
cd backend
npm install

# Frontend  
cd ../frontend
npm install
```

## 2. Настройка переменных окружения

Создайте файл `backend/.env`:

```env
YANDEX_API_KEY=ваш_ключ_yandex
YANDEX_FOLDER_ID=ваш_folder_id
FFMPEG_PATH=D:\Utils\ffmpeg\bin
PORT=3000
```

**Примечание:** Укажите правильный путь к FFmpeg в `FFMPEG_PATH` (если FFmpeg не в системном PATH).

**Как получить Yandex GPT API ключ:**
1. Перейдите на https://cloud.yandex.ru/
2. Войдите или зарегистрируйтесь
3. Создайте каталог (folder) в Yandex Cloud
4. Создайте сервисный аккаунт с ролью `ai.languageModels.user`
5. Создайте API-ключ для сервисного аккаунта
6. Скопируйте API-ключ в `YANDEX_API_KEY`
7. Скопируйте ID каталога в `YANDEX_FOLDER_ID`

**Примечание:** 
- `YANDEX_API_KEY` и `YANDEX_FOLDER_ID` - **обязательны** для работы системы
- Эти же ключи используются как для Yandex GPT (анализ и генерация), так и для Yandex Speech-to-Text (транскрипция аудио)

## 3. Установка FFmpeg

**Windows:**
```bash
# Через Chocolatey
choco install ffmpeg

# Или скачайте с https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
# или
sudo yum install ffmpeg
```

Проверьте установку:
```bash
ffmpeg -version
```

## 4. Запуск

**Терминал 1 - Backend:**
```bash
cd backend
npm run start:dev
```

**Терминал 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## 5. Использование

1. Откройте http://localhost:5173
2. Загрузите видео файл
3. Нажмите "Анализировать видео"
4. Дождитесь результатов
5. Введите тему и сгенерируйте сценарий

## Решение проблем

### Ошибка "YANDEX_API_KEY is not set"
- Убедитесь, что файл `backend/.env` существует
- Проверьте, что ключ указан правильно

### Ошибка "YANDEX_FOLDER_ID is not set"
- Убедитесь, что указан ID каталога в Yandex Cloud
- ID каталога можно найти в консоли Yandex Cloud

### Ошибка аутентификации Yandex GPT
- Проверьте правильность `YANDEX_API_KEY`
- Убедитесь, что сервисный аккаунт имеет роль `ai.languageModels.user`
- Проверьте, что `YANDEX_FOLDER_ID` указан правильно

### Ошибка "FFmpeg not found"
- Установите FFmpeg (см. шаг 3)
- Убедитесь, что FFmpeg доступен в PATH
- Или укажите путь в `FFMPEG_PATH`

### Ошибка при загрузке файла
- Проверьте формат файла (MP4, MOV, AVI)
- Максимальный размер: 100MB
- Убедитесь, что папка `backend/uploads` существует

### CORS ошибки
- Убедитесь, что бэкенд запущен на порту 3000
- Проверьте настройки CORS в `backend/src/main.ts`

### Транскрипция не работает
- Убедитесь, что `OPENAI_API_KEY` указан в `.env`
- Проверьте баланс на OpenAI аккаунте
- Без OpenAI API анализ будет выполнен на основе визуального контекста
