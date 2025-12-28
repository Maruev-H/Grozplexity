# Решение проблем

## Ошибки TypeScript в IDE

Если вы видите ошибки типа "Cannot find module '@nestjs/config'" в IDE, но пакеты установлены:

### Решение 1: Перезапуск TypeScript сервера
1. В VS Code/Cursor нажмите `Ctrl+Shift+P` (или `Cmd+Shift+P` на Mac)
2. Введите "TypeScript: Restart TS Server"
3. Нажмите Enter

### Решение 2: Перезапуск IDE
Просто закройте и откройте IDE заново.

### Решение 3: Очистка кэша
```bash
cd backend
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Решение 4: Проверка установки
Убедитесь, что пакеты установлены:
```bash
cd backend
npm list @nestjs/config @google/generative-ai fluent-ffmpeg @google-cloud/speech
```

Если пакеты не найдены, установите их:
```bash
npm install --legacy-peer-deps
```

## Ошибки при запуске

### "GEMINI_API_KEY is not set"
- Создайте файл `backend/.env`
- Добавьте: `GEMINI_API_KEY=ваш_ключ`
- Перезапустите сервер

### "FFmpeg not found"
- Установите FFmpeg (см. README.md)
- Убедитесь, что FFmpeg в PATH: `ffmpeg -version`

### CORS ошибки
- Убедитесь, что бэкенд запущен на порту 3000
- Проверьте настройки CORS в `backend/src/main.ts`

### Ошибки загрузки файлов
- Проверьте формат файла (MP4, MOV, AVI)
- Максимальный размер: 100MB
- Убедитесь, что папка `backend/uploads` существует

## Проблемы с зависимостями

### Конфликты версий
Если возникают конфликты версий, используйте:
```bash
npm install --legacy-peer-deps
```

### Устаревшие пакеты
Некоторые пакеты (multer, fluent-ffmpeg) помечены как deprecated, но они работают. 
Это нормально для данного проекта.

