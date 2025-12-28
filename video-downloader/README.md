# Video Downloader Microservice

Микросервис для скачивания видео с YouTube Shorts, TikTok и Instagram Reels используя yt-dlp.

## Установка

1. Установите зависимости:
```bash
cd video-downloader
pip install -r requirements.txt
```

2. Убедитесь, что yt-dlp установлен (включен в requirements.txt):
```bash
pip install yt-dlp
```

## Запуск

```bash
python app.py
```

Сервис запустится на `http://localhost:5000` (по умолчанию).

**Если порт 5000 занят**, используйте другой порт:
```bash
# Windows
set PORT=5001 && python app.py

# Linux/Mac
PORT=5001 python app.py
```

**Важно:** 
- Этот сервис должен быть запущен для работы скачивания видео по URL
- Убедитесь, что порт не занят другим сервисом (например, universalDownloader)
- Если используете другой порт, обновите `DOWNLOADER_URL` в `backend/.env`

## API Endpoints

### GET /download
Скачивает видео по URL

**Параметры:**
- `url` (query) - URL видео (обязательно)

**Пример:**
```
GET http://localhost:5000/download?url=https://www.youtube.com/watch?v=...
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "file_path": "/tmp/video_downloader/uuid.mp4",
    "title": "Video Title",
    "duration": 120,
    "thumbnail": "https://...",
    "platform": "youtube"
  }
}
```

### GET /download/file
Получает скачанный файл

**Параметры:**
- `file_path` (query) - путь к файлу (обязательно)

**Пример:**
```
GET http://localhost:5000/download/file?file_path=/tmp/video_downloader/uuid.mp4
```

### GET /health
Health check эндпоинт

**Ответ:**
```json
{
  "status": "ok",
  "service": "video-downloader"
}
```

## Поддерживаемые платформы

- YouTube (включая Shorts)
- TikTok
- Instagram (включая Reels)

## Использование с Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 5000

CMD ["python", "app.py"]
```

```bash
docker build -t video-downloader .
docker run -p 5000:5000 video-downloader
```

