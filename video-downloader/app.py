from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import yt_dlp
import os
import tempfile
import uuid
from pathlib import Path
import shutil

app = Flask(__name__)
CORS(app)

# Директория для временных файлов
TEMP_DIR = Path(tempfile.gettempdir()) / 'video_downloader'
TEMP_DIR.mkdir(exist_ok=True)

def detect_platform(url: str) -> str:
    """Определяет платформу по URL"""
    url_lower = url.lower()
    if 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return 'youtube'
    elif 'tiktok.com' in url_lower:
        return 'tiktok'
    elif 'instagram.com' in url_lower:
        return 'instagram'
    return 'unknown'

def download_video(url: str) -> dict:
    """Скачивает видео используя yt-dlp"""
    # Создаем уникальное имя файла
    unique_id = str(uuid.uuid4())
    output_path = str(TEMP_DIR / f"{unique_id}.%(ext)s")
    
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': output_path,
        'quiet': False,
        'no_warnings': False,
        'extract_flat': False,
    }
    
    downloaded_file = None
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Получаем информацию о видео
            info = ydl.extract_info(url, download=True)
            
            # Находим скачанный файл
            # yt-dlp может изменить расширение, поэтому ищем файл
            base_path = output_path.replace('%(ext)s', '')
            for ext in ['mp4', 'webm', 'mkv', 'mov']:
                potential_file = base_path + ext
                if os.path.exists(potential_file):
                    downloaded_file = potential_file
                    break
            
            # Если не нашли, ищем последний созданный файл в TEMP_DIR
            if not downloaded_file:
                files = list(TEMP_DIR.glob(f'{unique_id}.*'))
                if files:
                    downloaded_file = str(files[0])
            
            if not downloaded_file or not os.path.exists(downloaded_file):
                raise FileNotFoundError('Downloaded file not found')
            
            return {
                'success': True,
                'file_path': downloaded_file,
                'filename': os.path.basename(downloaded_file),
                'title': info.get('title', ''),
                'duration': info.get('duration', 0),
                'thumbnail': info.get('thumbnail', ''),
                'platform': detect_platform(url),
            }
    except Exception as e:
        # Удаляем файл в случае ошибки
        if downloaded_file and os.path.exists(downloaded_file):
            try:
                os.remove(downloaded_file)
            except:
                pass
        return {
            'success': False,
            'error': str(e)
        }

@app.route('/download', methods=['GET'])
def download():
    """Эндпоинт для скачивания видео"""
    url = request.args.get('url')
    
    if not url:
        return jsonify({
            'success': False,
            'error': 'Missing "url" query parameter'
        }), 400
    
    platform = detect_platform(url)
    if platform == 'unknown':
        return jsonify({
            'success': False,
            'error': 'Unsupported platform. Supported: YouTube, TikTok, Instagram'
        }), 400
    
    result = download_video(url)
    
    if result['success']:
        return jsonify({
            'success': True,
            'data': {
                'file_path': result['file_path'],
                'filename': result['filename'],
                'title': result['title'],
                'duration': result['duration'],
                'thumbnail': result['thumbnail'],
                'platform': result['platform'],
            }
        })
    else:
        return jsonify({
            'success': False,
            'error': result['error']
        }), 500

@app.route('/download/file', methods=['GET'])
def download_file():
    """Эндпоинт для получения скачанного файла"""
    file_path = request.args.get('file_path')
    
    if not file_path:
        return jsonify({
            'success': False,
            'error': 'Missing "file_path" query parameter'
        }), 400
    
    if not os.path.exists(file_path):
        return jsonify({
            'success': False,
            'error': 'File not found'
        }), 404
    
    return send_file(file_path, as_attachment=True, download_name=os.path.basename(file_path))

@app.route('/health', methods=['GET'])
def health():
    """Health check эндпоинт"""
    return jsonify({
        'status': 'ok',
        'service': 'video-downloader'
    })

if __name__ == '__main__':
    import sys
    port = int(os.environ.get('PORT', 5000))
    print(f'Starting video-downloader server on http://0.0.0.0:{port}')
    print('Press CTRL+C to stop')
    try:
        app.run(host='0.0.0.0', port=port, debug=True)
    except OSError as e:
        if 'Address already in use' in str(e) or 'address is already in use' in str(e).lower():
            print(f'\nERROR: Port {port} is already in use!')
            print(f'Please stop the other service or use a different port:')
            print(f'  Windows: set PORT=5001 && py app.py')
            print(f'  Linux/Mac: PORT=5001 python app.py')
            sys.exit(1)
        else:
            raise

