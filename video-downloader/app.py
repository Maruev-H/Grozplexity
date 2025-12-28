from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import yt_dlp
import os
import tempfile
import uuid
from pathlib import Path
import shutil
import re
from urllib.parse import urlparse, urljoin
import requests
from bs4 import BeautifulSoup
import json

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

def is_profile_url(url: str) -> bool:
    """Определяет, является ли URL ссылкой на профиль/канал, а не на конкретное видео"""
    url_lower = url.lower()
    parsed = urlparse(url)
    pathname = parsed.path.lower()
    
    # YouTube: канал, профиль или shorts плейлист
    if 'youtube.com/@' in url_lower:
        # Если путь заканчивается на /shorts или /@username/shorts - это плейлист shorts (профиль)
        if '/shorts' in pathname:
            # Проверяем, не является ли это конкретным видео (есть ID после /shorts/)
            if re.match(r'^/@[^/]+/shorts/[a-zA-Z0-9_-]+$', pathname):
                return False  # Это конкретное видео
            # Если путь заканчивается на /shorts или /@username/shorts - это плейлист (профиль)
            if pathname.endswith('/shorts') or pathname.endswith('/shorts/'):
                return True  # Это плейлист shorts профиля
        # Если есть /@username без /watch или /shorts/ID - это профиль
        if re.match(r'^/@[^/]+$', pathname) or re.match(r'^/@[^/]+/shorts/?$', pathname):
            return True
        # Если нет /watch и не конкретное видео - это профиль
        if '/watch' not in pathname and not re.match(r'/shorts/[a-zA-Z0-9_-]+$', pathname):
            return True
    if ('youtube.com/c/' in url_lower or 
        'youtube.com/channel/' in url_lower or
        'youtube.com/user/' in url_lower or
        'youtube.com/playlist' in url_lower):
        return True
    
    # TikTok: профиль (без /video/)
    if 'tiktok.com/@' in url_lower:
        # Если путь заканчивается на /@username или /@username/ - это профиль
        if re.match(r'^/@[^/]+/?$', pathname) or pathname == '/':
            return True
        # Если нет /video/ - это профиль
        if '/video/' not in pathname:
            return True
    
    # Instagram: профиль (без /p/, /reel/, /tv/)
    if 'instagram.com/' in url_lower:
        # Если путь заканчивается на /username или /username/ - это профиль
        if re.match(r'^/[^/]+/?$', pathname) and pathname != '/':
            # Проверяем, что это не конкретный пост/рилс
            if ('/p/' not in pathname and 
                '/reel/' not in pathname and 
                '/tv/' not in pathname and
                '/stories/' not in pathname):
                return True
    
    return False

def get_instagram_profile_videos(url: str, limit: int = 3) -> list:
    """Получает список последних Reels из Instagram профиля через парсинг HTML или yt-dlp"""
    # Сначала пробуем yt-dlp (более надежный метод)
    print(f"Trying yt-dlp for Instagram profile: {url}")
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'playlistend': limit * 2,  # Берем больше для фильтрации
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            videos = []
            
            if 'entries' in info:
                # Фильтруем только Reels
                for entry in info['entries']:
                    if entry:
                        entry_url = entry.get('url') or entry.get('webpage_url') or ''
                        # Проверяем, что это Reel
                        if '/reel/' in entry_url.lower() or entry.get('duration', 0) <= 90:
                            video_url = entry_url or f"https://www.instagram.com/reel/{entry.get('id', '')}"
                            videos.append({
                                'url': video_url,
                                'title': entry.get('title', 'Instagram Reel'),
                                'duration': entry.get('duration', 0),
                                'thumbnail': entry.get('thumbnail', ''),
                            })
                            print(f"Found Reel via yt-dlp: {video_url}")
                            if len(videos) >= limit:
                                break
            
            if videos:
                print(f"Successfully got {len(videos)} videos via yt-dlp")
                return videos[:limit]
            else:
                print("yt-dlp returned no videos, trying HTML parsing...")
    except Exception as e:
        error_msg = str(e)
        print(f"yt-dlp method failed: {error_msg}")
        
        # Проверяем, нужно ли обновить yt-dlp
        if "Unable to extract data" in error_msg or "please report this issue" in error_msg:
            print("WARNING: yt-dlp may need to be updated. Try: pip install --upgrade yt-dlp")
            print("Instagram may also require authentication or the profile may be private.")
        
        print("Falling back to HTML parsing...")
    
    # Fallback: парсинг HTML
    try:
        # Получаем HTML страницы профиля
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        print(f"Fetching Instagram profile: {url}")
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        print(f"Response status: {response.status_code}, Content length: {len(response.text)}")
        
        soup = BeautifulSoup(response.text, 'html.parser')
        videos = []
        reel_links = set()
        
        # Вариант 1: ищем все ссылки с /reel/ в href
        print("Searching for /reel/ links in <a> tags...")
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            if '/reel/' in href.lower():
                # Преобразуем относительный URL в абсолютный
                if href.startswith('/'):
                    full_url = urljoin('https://www.instagram.com', href)
                elif href.startswith('http'):
                    full_url = href
                else:
                    full_url = urljoin(url, href)
                reel_links.add(full_url)
                print(f"Found reel link: {full_url}")
        
        # Вариант 2: ищем в data-атрибутах
        print("Searching in data-* attributes...")
        for element in soup.find_all(attrs={'data-href': True}):
            href = element.get('data-href', '')
            if '/reel/' in href.lower():
                if href.startswith('/'):
                    full_url = urljoin('https://www.instagram.com', href)
                elif href.startswith('http'):
                    full_url = href
                else:
                    full_url = urljoin(url, href)
                reel_links.add(full_url)
                print(f"Found reel link in data-href: {full_url}")
        
        # Вариант 3: ищем в JSON данных (Instagram часто хранит данные в script тегах)
        print("Searching in JSON script tags...")
        for script in soup.find_all('script'):
            script_type = script.get('type', '')
            script_text = script.string or ''
            
            # Ищем JSON данные
            if script_type == 'application/json' or 'application/ld+json' in script_type:
                try:
                    data = json.loads(script_text)
                    # Рекурсивно ищем ссылки на Reels в JSON
                    def find_reels_in_json(obj, found_links, depth=0):
                        if depth > 10:  # Ограничиваем глубину рекурсии
                            return
                        if isinstance(obj, dict):
                            for key, value in obj.items():
                                if isinstance(value, str) and '/reel/' in value.lower():
                                    if value.startswith('/'):
                                        full_url = urljoin('https://www.instagram.com', value)
                                    elif value.startswith('http'):
                                        full_url = value
                                    else:
                                        full_url = urljoin(url, value)
                                    found_links.add(full_url)
                                    print(f"Found reel link in JSON: {full_url}")
                                find_reels_in_json(value, found_links, depth + 1)
                        elif isinstance(obj, list):
                            for item in obj:
                                find_reels_in_json(item, found_links, depth + 1)
                        elif isinstance(obj, str) and '/reel/' in obj.lower():
                            if obj.startswith('/'):
                                full_url = urljoin('https://www.instagram.com', obj)
                            elif obj.startswith('http'):
                                full_url = obj
                            else:
                                full_url = urljoin(url, obj)
                            found_links.add(full_url)
                            print(f"Found reel link in JSON string: {full_url}")
                    
                    find_reels_in_json(data, reel_links)
                except json.JSONDecodeError:
                    pass
                except Exception as e:
                    print(f"Error parsing JSON in script: {e}")
            
            # Также ищем /reel/ прямо в тексте скрипта
            if '/reel/' in script_text.lower():
                import re as re_module
                reel_matches = re_module.findall(r'["\']([^"\']*\/reel\/[^"\']*)["\']', script_text)
                for match in reel_matches:
                    if match.startswith('/'):
                        full_url = urljoin('https://www.instagram.com', match)
                    elif match.startswith('http'):
                        full_url = match
                    else:
                        full_url = urljoin(url, match)
                    reel_links.add(full_url)
                    print(f"Found reel link in script text: {full_url}")
        
        print(f"Total unique reel links found: {len(reel_links)}")
        
        # Преобразуем в список и ограничиваем
        reel_list = list(reel_links)[:limit]
        
        if not reel_list:
            print("No reel links found. Trying to find any video links...")
            # Пробуем найти любые ссылки на видео/посты
            for link in soup.find_all('a', href=True):
                href = link.get('href', '')
                if href and ('/p/' in href or '/tv/' in href):
                    if href.startswith('/'):
                        full_url = urljoin('https://www.instagram.com', href)
                    elif href.startswith('http'):
                        full_url = href
                    else:
                        full_url = urljoin(url, href)
                    reel_list.append(full_url)
                    print(f"Found alternative video link: {full_url}")
                    if len(reel_list) >= limit:
                        break
        
        # Для каждого Reel получаем информацию через yt-dlp
        for reel_url in reel_list:
            try:
                print(f"Extracting info for: {reel_url}")
                ydl_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'extract_flat': True,
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(reel_url, download=False)
                    if info:
                        videos.append({
                            'url': reel_url,
                            'title': info.get('title', 'Instagram Reel'),
                            'duration': info.get('duration', 0),
                            'thumbnail': info.get('thumbnail', ''),
                        })
                        print(f"Successfully extracted info for: {reel_url}")
            except Exception as e:
                print(f"Error extracting info for {reel_url}: {e}")
                # Если не удалось получить через yt-dlp, добавляем базовую информацию
                videos.append({
                    'url': reel_url,
                    'title': 'Instagram Reel',
                    'duration': 0,
                    'thumbnail': '',
                })
        
        print(f"Returning {len(videos)} videos from HTML parsing")
        
        if len(videos) == 0:
                print("WARNING: No videos found. This might be due to:")
                print("1. Instagram requires login/authentication")
                print("2. Profile is private")
                print("3. Profile has no Reels")
                print("4. Instagram changed their HTML structure")
                print(f"HTML content length: {len(response.text)}")
                # Сохраняем HTML для отладки (первые 2000 символов)
                print(f"HTML preview (first 2000 chars): {response.text[:2000]}")
        
        return videos[:limit]
    except requests.exceptions.Timeout as e:
        print(f"Timeout getting Instagram profile: {e}")
        print("Instagram may be blocking requests or connection is slow.")
        return []
    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error getting Instagram profile: {e}")
        print(f"Response status: {e.response.status_code if hasattr(e, 'response') else 'unknown'}")
        return []
    except Exception as e:
        print(f"Error getting Instagram profile videos: {e}")
        import traceback
        traceback.print_exc()
        return []

def get_profile_info(url: str) -> dict:
    """Получает информацию о профиле (bio, description, links)"""
    platform = detect_platform(url)
    
    if platform == 'unknown':
        return {
            'profile_header': '',
            'description': '',
            'bio': '',
            'links': [],
            'external_links': False,
            'cta_in_bio': '',
        }
    
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Извлекаем шапку профиля (bio/header) в зависимости от платформы
            profile_header = ''
            if platform == 'youtube':
                # Для YouTube: channel_description или description канала
                profile_header = info.get('channel_description', '') or info.get('description', '') or ''
            elif platform == 'tiktok':
                # Для TikTok: description или signature
                profile_header = info.get('description', '') or info.get('signature', '') or info.get('uploader', '') or ''
            elif platform == 'instagram':
                # Для Instagram: description или biography
                profile_header = info.get('description', '') or info.get('biography', '') or info.get('fullname', '') or ''
            
            # Полное описание (может быть длиннее)
            description = info.get('description', '') or info.get('channel_description', '') or ''
            
            # Имя автора/канала
            bio = info.get('uploader', '') or info.get('channel', '') or info.get('fullname', '') or ''
            
            # Извлекаем ссылки из описания
            links = []
            external_links = False
            cta_in_bio = ''
            
            # Ищем ссылки в описании
            url_pattern = r'https?://[^\s]+'
            found_links = re.findall(url_pattern, description)
            
            for link in found_links:
                # Проверяем, что это внешняя ссылка (не YouTube/Instagram/TikTok)
                if not any(domain in link.lower() for domain in ['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com']):
                    external_links = True
                links.append(link)
            
            # Ищем CTA в bio/description
            cta_keywords = ['telegram', 'tg', 'подробнее', 'ссылка', 'link', 'перейти', 'читать', 'читать далее']
            description_lower = description.lower()
            for keyword in cta_keywords:
                if keyword in description_lower:
                    # Извлекаем контекст вокруг ключевого слова
                    idx = description_lower.find(keyword)
                    start = max(0, idx - 30)
                    end = min(len(description), idx + len(keyword) + 30)
                    cta_in_bio = description[start:end].strip()
                    break
            
            return {
                'profile_header': profile_header,  # Шапка профиля (короткое описание)
                'description': description,  # Полное описание
                'bio': bio,  # Имя автора
                'links': links,
                'external_links': external_links,
                'cta_in_bio': cta_in_bio,
            }
    except Exception as e:
        print(f"Error getting profile info: {e}")
        return {
            'description': '',
            'bio': '',
            'links': [],
            'external_links': False,
            'cta_in_bio': '',
        }

def get_profile_videos(url: str, limit: int = 3) -> list:
    """Получает список последних видео из профиля/канала"""
    platform = detect_platform(url)
    
    if platform == 'unknown':
        return []
    
    # Для Instagram используем специальный парсинг HTML
    if platform == 'instagram':
        return get_instagram_profile_videos(url, limit)
    
    # Для YouTube с /shorts - используем специальную обработку
    channel_url = url
    filter_shorts = False
    if platform == 'youtube' and '/shorts' in url.lower():
        # Для YouTube Shorts плейлиста нужно использовать формат канала
        # Преобразуем youtube.com/@username/shorts в формат для получения всех видео
        parsed = urlparse(url)
        if parsed.path.startswith('/@'):
            # Извлекаем username (без @)
            path_parts = parsed.path.split('/')
            username = path_parts[1]  # @username
            # Используем формат канала для получения всех видео
            channel_url = f"https://www.youtube.com/{username}/shorts"
            filter_shorts = True
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,  # Не скачиваем, только получаем информацию
        'playlistend': limit * 3 if filter_shorts else limit,  # Берем больше для фильтрации shorts
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(channel_url, download=False)
            
            videos = []
            
            # Обрабатываем разные форматы ответа
            if 'entries' in info:
                # Это плейлист или канал с несколькими видео
                entries = info['entries']
                
                # Для YouTube с /shorts фильтруем только shorts видео
                if filter_shorts:
                    shorts_entries = []
                    for entry in entries:
                        if entry:
                            # Проверяем URL - shorts обычно содержат /shorts/ в URL
                            entry_url = entry.get('url') or entry.get('webpage_url') or ''
                            if '/shorts/' in entry_url.lower():
                                shorts_entries.append(entry)
                            # Также проверяем длительность (shorts обычно < 60 сек)
                            duration = entry.get('duration', 0)
                            if duration > 0 and duration <= 60:
                                shorts_entries.append(entry)
                    entries = shorts_entries[:limit]
                else:
                    entries = entries[:limit]
                
                for entry in entries:
                    if entry:
                        video_url = entry.get('url') or entry.get('webpage_url') or f"https://www.youtube.com/watch?v={entry.get('id', '')}"
                        videos.append({
                            'url': video_url,
                            'title': entry.get('title', 'Без названия'),
                            'duration': entry.get('duration', 0),
                            'thumbnail': entry.get('thumbnail', ''),
                        })
            elif 'id' in info:
                # Одно видео
                video_url = info.get('url') or info.get('webpage_url') or url
                videos.append({
                    'url': video_url,
                    'title': info.get('title', 'Без названия'),
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', ''),
                })
            
            return videos
    except Exception as e:
        print(f"Error getting profile videos: {e}")
        import traceback
        traceback.print_exc()
        return []

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

@app.route('/profile/info', methods=['GET'])
def get_profile_info_endpoint():
    """Получает информацию о профиле (bio, description, links)"""
    url = request.args.get('url')
    
    if not url:
        return jsonify({
            'success': False,
            'error': 'URL parameter is required'
        }), 400
    
    try:
        print(f"Getting profile info for: {url}")
        profile_info = get_profile_info(url)
        
        return jsonify({
            'success': True,
            'data': profile_info
        })
    except Exception as e:
        print(f"Error getting profile info: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/profile/videos', methods=['GET'])
def get_profile_videos_endpoint():
    """Эндпоинт для получения списка последних видео из профиля"""
    url = request.args.get('url')
    limit = int(request.args.get('limit', 3))
    
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
    
    if not is_profile_url(url):
        return jsonify({
            'success': False,
            'error': 'URL is not a profile/channel link. Please provide a profile URL, not a video URL.'
        }), 400
    
    try:
        print(f"Processing profile videos request: {url}, platform: {platform}, limit: {limit}")
        videos = get_profile_videos(url, limit)
        
        print(f"get_profile_videos returned {len(videos)} videos")
        
        if not videos:
            error_msg = f'No videos found in profile or unable to extract videos. Platform: {platform}'
            if platform == 'instagram':
                error_msg += (
                    '\n\nВозможные причины:\n'
                    '1. Instagram требует авторизацию (обновите yt-dlp: pip install --upgrade yt-dlp)\n'
                    '2. Профиль приватный\n'
                    '3. Профиль не содержит Reels\n'
                    '4. Instagram блокирует запросы\n\n'
                    'Альтернатива: вставьте прямые ссылки на Reels через режим "Ссылка на видео"'
                )
            print(f"ERROR: {error_msg}")
            return jsonify({
                'success': False,
                'error': error_msg
            }), 404
        
        return jsonify({
            'success': True,
            'data': {
                'videos': videos,
                'count': len(videos),
                'platform': platform
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

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

