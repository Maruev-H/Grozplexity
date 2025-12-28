import { useState } from 'react';
import axios from 'axios';
import { Upload, Video, Sparkles, FileText, Loader2, CheckCircle2, XCircle, Link, Copy, Check } from 'lucide-react';
import './App.css';

const API_URL = 'http://localhost:3000';

interface StylePassport {
  structure: {
    hook: string;
    setup: string;
    main: string;
    climax: string;
    cta: string;
  };
  toneOfVoice: {
    speechRate: string;
    typicalPhrases: string[];
    emotionalTone: string;
    style: string;
  };
  visualContext: {
    setting: string;
    pacing: string;
    keyElements: string[];
  };
  insights: {
    retentionHooks: string[];
    patterns: string[];
    uniqueElements: string[];
  };
}

interface AnalysisResult {
  transcript: string;
  frames: string[];
  stylePassport: StylePassport;
  visualDescription?: string;
  isProfileAnalysis?: boolean;
  videos?: Array<{ title: string; url: string }>;
  profileDescription?: {
    header: string;
    original: string;
    bio: string;
    links: string[];
  };
  profileHeaderAnalysis?: {
    headerText: string;
    keyWords: string[];
    hasCta: boolean;
    ctaText: string;
    structure: string;
    analysis: string;
  };
  profileAnalysis?: {
    hasExternalLinks: boolean;
    repeatingCtaInHeader: string;
    ctaType: string;
    consistency: string;
    profileAsExtension: boolean;
  };
  dnaAnalysis?: {
    structuralPatterns: string[];
    speechFormula: {
      speedRange?: string;
      speedVariation?: string;
      emotionalTone?: string;
      personalFormulations?: string;
    };
    consistency: string[];
    variability: string[];
    productConclusion: string;
    dnaUsage: string[];
  };
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [profileUrl, setProfileUrl] = useState<string>('');
  const [inputMode, setInputMode] = useState<'file' | 'url' | 'profile'>('file');
  const [uploading, setUploading] = useState(false);
  const [analyzingProfile, setAnalyzingProfile] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptTopic, setScriptTopic] = useState('');
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatedScripts, setGeneratedScripts] = useState<string[]>([]);
  const [hookAnalysis, setHookAnalysis] = useState<{ [key: string]: { pluses: string[]; minuses: string[]; analysis: string } }>({});
  const [copiedScriptIndex, setCopiedScriptIndex] = useState<number | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setAnalysis(null);
      setGeneratedScripts([]);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVideoUrl(e.target.value);
    setError(null);
    setAnalysis(null);
    setGeneratedScripts([]);
  };

  const handleProfileUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileUrl(e.target.value);
    setError(null);
    setAnalysis(null);
    setGeneratedScripts([]);
  };

  const isValidUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      return (
        hostname.includes('youtube.com') ||
        hostname.includes('youtu.be') ||
        hostname.includes('tiktok.com') ||
        hostname.includes('instagram.com')
      );
    } catch {
      return false;
    }
  };

  const isProfileUrl = (url: string): boolean => {
    const urlLower = url.toLowerCase();
    
    // YouTube: канал, профиль или shorts плейлист
    // Форматы: youtube.com/@username, youtube.com/@username/shorts, youtube.com/c/channelname, youtube.com/channel/ID
    if (urlLower.includes('youtube.com/@')) {
      // Проверяем, что это не конкретное видео (нет /watch или /shorts/ с ID)
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      // Если путь заканчивается на /shorts или /@username/shorts - это плейлист shorts (профиль)
      if (pathname.includes('/shorts') && !pathname.match(/\/shorts\/[a-zA-Z0-9_-]+$/)) {
        return true; // Это плейлист shorts профиля
      }
      // Если есть /@username без /watch или /shorts/ID - это профиль
      if (pathname.match(/^\/@[^\/]+$/) || pathname.match(/^\/@[^\/]+\/shorts$/)) {
        return true;
      }
      // Если нет /watch - это профиль
      if (!pathname.includes('/watch') && !pathname.match(/\/shorts\/[a-zA-Z0-9_-]+$/)) {
        return true;
      }
    }
    if (urlLower.includes('youtube.com/c/') || 
        urlLower.includes('youtube.com/channel/') ||
        urlLower.includes('youtube.com/user/')) {
      return true;
    }
    
    // TikTok: профиль (без /video/)
    // Формат: tiktok.com/@username
    if (urlLower.includes('tiktok.com/@')) {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      // Если путь заканчивается на /@username или /@username/ - это профиль
      if (pathname.match(/^\/@[^\/]+\/?$/) || pathname === '/') {
        return true;
      }
      // Если нет /video/ - это профиль
      if (!pathname.includes('/video/')) {
        return true;
      }
    }
    
    // Instagram: профиль (без /p/, /reel/, /tv/)
    // Формат: instagram.com/username
    if (urlLower.includes('instagram.com/')) {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      // Если путь заканчивается на /username или /username/ - это профиль
      if (pathname.match(/^\/[^\/]+\/?$/) && pathname !== '/') {
        // Проверяем, что это не конкретный пост/рилс
        if (!pathname.includes('/p/') && 
            !pathname.includes('/reel/') && 
            !pathname.includes('/tv/') &&
            !pathname.includes('/stories/')) {
          return true;
        }
      }
    }
    
    return false;
  };

  const handleUpload = async () => {
    if (inputMode === 'file') {
      if (!file) {
        setError('Пожалуйста, выберите файл');
        return;
      }

      setUploading(true);
      setError(null);
      setAnalysis(null);

      const formData = new FormData();
      formData.append('video', file);

      try {
        const response = await axios.post(`${API_URL}/video/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        setAnalysis(response.data);
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Ошибка при загрузке видео';
        
        // Улучшенная обработка ошибок Yandex GPT
        if (errorMessage.includes('аутентификации') || errorMessage.includes('API') || errorMessage.includes('YANDEX')) {
          setError('Ошибка аутентификации Yandex GPT. Проверьте YANDEX_API_KEY и YANDEX_FOLDER_ID.');
        } else if (errorMessage.includes('лимит') || errorMessage.includes('429')) {
          setError('Превышен лимит запросов Yandex GPT. Попробуйте позже.');
        } else {
          setError(errorMessage);
        }
        console.error('Upload error:', err);
      } finally {
        setUploading(false);
      }
    } else {
      // Режим URL (старая логика - оставляем для обратной совместимости)
      if (!videoUrl.trim()) {
        setError('Пожалуйста, введите ссылку на видео');
        return;
      }

      if (!isValidUrl(videoUrl)) {
        setError('Неподдерживаемая ссылка. Поддерживаются: YouTube, TikTok, Instagram');
        return;
      }

      setUploading(true);
      setError(null);
      setAnalysis(null);

      try {
        // Проверяем, является ли это ссылкой на профиль
        if (isProfileUrl(videoUrl.trim())) {
          // Анализируем профиль (последние 3 видео)
          const response = await axios.post(`${API_URL}/video/analyze-profile`, {
            profileUrl: videoUrl.trim(),
            videosCount: 3,
          });
          // Преобразуем результат анализа профиля в формат анализа одного видео
          setAnalysis({
            transcript: `Проанализировано ${response.data.videosAnalyzed} видео из профиля`,
            frames: [],
            stylePassport: response.data.aggregatedStylePassport,
            visualDescription: 'Анализ профиля автора',
            isProfileAnalysis: true,
            videos: response.data.videos,
            profileDescription: response.data.profileDescription,
            profileAnalysis: response.data.profileAnalysis,
            dnaAnalysis: response.data.dnaAnalysis,
          });
        } else {
          // Анализируем одно видео
          const response = await axios.post(`${API_URL}/video/analyze-url`, {
            url: videoUrl.trim(),
          });
          setAnalysis(response.data);
        }
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Ошибка при обработке видео';
        
        // Улучшенная обработка ошибок
        if (errorMessage.includes('аутентификации') || errorMessage.includes('API') || errorMessage.includes('YANDEX')) {
          setError('Ошибка аутентификации Yandex GPT. Проверьте YANDEX_API_KEY и YANDEX_FOLDER_ID.');
        } else if (errorMessage.includes('лимит') || errorMessage.includes('429')) {
          setError('Превышен лимит запросов Yandex GPT. Попробуйте позже.');
        } else if (errorMessage.includes('Неподдерживаемая платформа')) {
          setError('Неподдерживаемая платформа. Поддерживаются: YouTube, TikTok, Instagram');
        } else {
          setError(errorMessage);
        }
        console.error('URL processing error:', err);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleAnalyzeProfile = async () => {
    if (!profileUrl.trim()) {
      setError('Пожалуйста, введите ссылку на профиль');
      return;
    }

    if (!isValidUrl(profileUrl)) {
      setError('Неподдерживаемая ссылка. Поддерживаются: YouTube, TikTok, Instagram');
      return;
    }

    if (!isProfileUrl(profileUrl.trim())) {
      setError('Это не ссылка на профиль. Пожалуйста, вставьте ссылку на профиль автора (канал, аккаунт)');
      return;
    }

    setAnalyzingProfile(true);
    setError(null);
    setAnalysis(null);
    setGeneratedScripts([]);

    try {
      const response = await axios.post(`${API_URL}/video/analyze-profile`, {
        profileUrl: profileUrl.trim(),
        videosCount: 3,
      });
      
      // Преобразуем результат анализа профиля в формат анализа одного видео
      setAnalysis({
        transcript: `Проанализировано ${response.data.videosAnalyzed} видео из профиля автора. Проведен анализ ДНК стиля.`,
        frames: [],
        stylePassport: response.data.aggregatedStylePassport,
        visualDescription: 'Анализ ДНК профиля автора на основе последних видео',
        isProfileAnalysis: true,
        videos: response.data.videos,
        profileDescription: response.data.profileDescription,
        profileAnalysis: response.data.profileAnalysis,
        dnaAnalysis: response.data.dnaAnalysis,
      });
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Ошибка при анализе профиля';
      
      if (errorMessage.includes('не запущен') || errorMessage.includes('ECONNREFUSED')) {
        setError('Python микросервис video-downloader не запущен. Запустите его для анализа профилей.');
      } else {
        setError(errorMessage);
      }
      console.error('Profile analysis error:', err);
    } finally {
      setAnalyzingProfile(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!scriptTopic.trim() || !analysis) {
      setError('Введите тему для сценария');
      return;
    }

    setGeneratingScript(true);
    setError(null);
    setGeneratedScripts([]);
    setHookAnalysis({});

    try {
      const response = await axios.post(`${API_URL}/video/generate-script`, {
        topic: scriptTopic,
        stylePassport: analysis.stylePassport,
        variants: 3, // Всегда генерируем 3 варианта
      });
      
      if (response.data.variants && response.data.scripts) {
        setGeneratedScripts(response.data.scripts);
        // Автоматически устанавливаем анализ хуков, если они пришли с сервера
        if (response.data.hooksAnalysis) {
          setHookAnalysis(response.data.hooksAnalysis);
        }
      } else if (response.data.script) {
        // Fallback: если вернулся один сценарий, оборачиваем в массив
        setGeneratedScripts([response.data.script]);
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Ошибка при генерации сценария';
      
      // Улучшенная обработка ошибок Yandex GPT
      if (errorMessage.includes('аутентификации') || errorMessage.includes('API') || errorMessage.includes('YANDEX')) {
        setError('Ошибка аутентификации Yandex GPT. Проверьте YANDEX_API_KEY и YANDEX_FOLDER_ID.');
      } else if (errorMessage.includes('лимит') || errorMessage.includes('429')) {
        setError('Превышен лимит запросов Yandex GPT. Попробуйте позже.');
      } else {
        setError(errorMessage);
      }
      console.error('Script generation error:', err);
    } finally {
      setGeneratingScript(false);
    }
  };


  const handleCopyScript = async (script: string, index?: number) => {
    try {
      await navigator.clipboard.writeText(script);
      if (index !== undefined) {
        setCopiedScriptIndex(index);
        setTimeout(() => setCopiedScriptIndex(null), 2000);
      } else {
        setCopiedScriptIndex(-1);
        setTimeout(() => setCopiedScriptIndex(null), 2000);
      }
    } catch (err) {
      console.error('Failed to copy script:', err);
      setError('Не удалось скопировать сценарий');
    }
  };

  const extractHookFromScript = (script: string): string | null => {
    // Ищем первую секцию [00:00-00:05] или [00:00-00:10] с текстом
    const hookMatch = script.match(/\[00:00-00:0[0-9]\][\s\S]*?Текст:\s*(.+?)(?=\n\[|\n$)/);
    return hookMatch ? hookMatch[1].trim() : null;
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <Sparkles className="logo-icon" />
            <h1>Video Analyzer</h1>
          </div>
          <p className="subtitle">AI-ассистент для анализа видео-контента и выявления формул удержания</p>
        </div>
      </header>

      <main className="main">
        <div className="container">
          {/* Загрузка видео */}
          <section className="card upload-section">
            <h2>
              <Video className="section-icon" />
              Загрузка видео
            </h2>
            
            {/* Переключатель режима */}
            <div className="mode-switcher">
              <button
                type="button"
                className={`mode-btn ${inputMode === 'file' ? 'active' : ''}`}
                onClick={() => {
                  setInputMode('file');
                  setError(null);
                  setAnalysis(null);
                  setGeneratedScripts([]);
                }}
                disabled={uploading}
              >
                <Upload className="mode-icon" />
                Загрузить файл
              </button>
              <button
                type="button"
                className={`mode-btn ${inputMode === 'url' ? 'active' : ''}`}
                onClick={() => {
                  setInputMode('url');
                  setError(null);
                  setAnalysis(null);
                  setGeneratedScripts([]);
                }}
                disabled={uploading || analyzingProfile}
              >
                <Link className="mode-icon" />
                Ссылка на видео
              </button>
              <button
                type="button"
                className={`mode-btn ${inputMode === 'profile' ? 'active' : ''}`}
                onClick={() => {
                  setInputMode('profile');
                  setError(null);
                  setAnalysis(null);
                  setGeneratedScripts([]);
                }}
                disabled={uploading || analyzingProfile}
              >
                <Video className="mode-icon" />
                Профиль автора
              </button>
            </div>

            <div className="upload-area">
              {inputMode === 'file' ? (
                <>
                  <input
                    type="file"
                    id="video-upload"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="file-input"
                    disabled={uploading}
                  />
                  <label htmlFor="video-upload" className="upload-label">
                    <Upload className="upload-icon" />
                    <span>{file ? file.name : 'Выберите видео файл'}</span>
                  </label>
                  {file && (
                    <button
                      onClick={handleUpload}
                      disabled={uploading}
                      className="btn btn-primary"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="spinner" />
                          Обработка...
                        </>
                      ) : (
                        <>
                          <Sparkles />
                          Анализировать видео
                        </>
                      )}
                    </button>
                  )}
                </>
              ) : inputMode === 'profile' ? (
                <>
                  <div className="url-input-wrapper">
                    <input
                      type="text"
                      value={profileUrl}
                      onChange={handleProfileUrlChange}
                      placeholder="Вставьте ссылку на профиль автора (YouTube канал, TikTok аккаунт, Instagram профиль)"
                      className="url-input"
                      disabled={analyzingProfile}
                    />
                  </div>
                  <div className="url-hint">
                    <p>Поддерживаемые платформы:</p>
                    <ul>
                      <li>YouTube: youtube.com/@username или youtube.com/c/channelname</li>
                      <li>TikTok: tiktok.com/@username</li>
                      <li>Instagram: instagram.com/username</li>
                    </ul>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--primary)' }}>
                      🧬 <strong>Анализ ДНК:</strong> Мы проанализируем последние 3 видео автора и создадим обобщенный паспорт стиля с анализом паттернов, эволюции и консистентности!
                    </p>
                  </div>
                  {profileUrl.trim() && (
                    <button
                      onClick={handleAnalyzeProfile}
                      disabled={analyzingProfile || !isValidUrl(profileUrl) || !isProfileUrl(profileUrl.trim())}
                      className="btn btn-primary"
                    >
                      {analyzingProfile ? (
                        <>
                          <Loader2 className="spinner" />
                          Анализ ДНК профиля...
                        </>
                      ) : (
                        <>
                          <Sparkles />
                          Анализировать профиль (ДНК)
                        </>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="url-input-wrapper">
                    <input
                      type="text"
                      value={videoUrl}
                      onChange={handleUrlChange}
                      placeholder="Вставьте ссылку на видео (YouTube, TikTok, Instagram)"
                      className="url-input"
                      disabled={uploading}
                    />
                  </div>
                  <div className="url-hint">
                    <p>Поддерживаемые платформы:</p>
                    <ul>
                      <li>YouTube (видео, Shorts)</li>
                      <li>TikTok (видео)</li>
                      <li>Instagram (видео, Reels)</li>
                    </ul>
                  </div>
                  {videoUrl.trim() && (
                    <button
                      onClick={handleUpload}
                      disabled={uploading || !isValidUrl(videoUrl)}
                      className="btn btn-primary"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="spinner" />
                          Скачивание и обработка...
                        </>
                      ) : (
                        <>
                          <Sparkles />
                          Анализировать видео
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Ошибки */}
          {error && (
            <div className="alert alert-error">
              <XCircle />
              <span>{error}</span>
            </div>
          )}

          {/* Результаты анализа */}
          {analysis && (
            <>
              <section className="card">
                <h2>
                  <CheckCircle2 className="section-icon success" />
                  Результаты анализа
                </h2>

                {/* Информация о профиле и анализ ДНК, если анализировался профиль */}
                {analysis.isProfileAnalysis && analysis.videos && (
                  <>
                    <div className="result-section">
                      <h3>📹 Проанализированные видео</h3>
                      <div className="profile-videos">
                        <p>Проанализировано <strong>{analysis.videos.length}</strong> последних видео из профиля:</p>
                        <ul>
                          {analysis.videos.map((video: any, i: number) => (
                            <li key={i}>
                              <a href={video.url} target="_blank" rel="noopener noreferrer">
                                {video.title || `Видео ${i + 1}`}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {analysis.profileDescription && (
                      <div className="result-section">
                        <h3>📋 Шапка профиля автора</h3>
                        <div className="profile-header-section">
                          <div className="profile-header-original">
                            <h4>Оригинал:</h4>
                            <p className="profile-header-text">{analysis.profileDescription.header || 'не указано'}</p>
                          </div>
                          {analysis.profileHeaderAnalysis && (
                            <div className="profile-header-analysis">
                              <h4>Анализ шапки:</h4>
                              <div className="header-analysis-content">
                                <p><strong>Структура:</strong> {analysis.profileHeaderAnalysis.structure}</p>
                                {analysis.profileHeaderAnalysis.hasCta && (
                                  <p><strong>CTA:</strong> {analysis.profileHeaderAnalysis.ctaText}</p>
                                )}
                                {analysis.profileHeaderAnalysis.keyWords && analysis.profileHeaderAnalysis.keyWords.length > 0 && (
                                  <div>
                                    <strong>Ключевые слова:</strong>
                                    <ul className="header-keywords">
                                      {analysis.profileHeaderAnalysis.keyWords.map((word: string, i: number) => (
                                        <li key={i}>{word}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <p className="header-analysis-text"><strong>Анализ:</strong> {analysis.profileHeaderAnalysis.analysis}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {analysis.profileAnalysis && (
                      <div className="result-section">
                        <h3>🧠 Анализ профиля автора</h3>
                        <div className="profile-analysis">
                          <ul>
                            <li>Наличие внешних ссылок: <strong>{analysis.profileAnalysis.hasExternalLinks ? 'да' : 'нет'}</strong></li>
                            <li>Повторяющийся CTA в шапке: <strong>{analysis.profileAnalysis.repeatingCtaInHeader}</strong></li>
                            <li>Тип CTA: <strong>{analysis.profileAnalysis.ctaType}</strong></li>
                            <li>Консистентность: <strong>{analysis.profileAnalysis.consistency}</strong></li>
                            <li>Профиль используется как продолжение видео: <strong>{analysis.profileAnalysis.profileAsExtension ? 'да' : 'нет'}</strong></li>
                          </ul>
                        </div>
                      </div>
                    )}

                    {analysis.dnaAnalysis && (
                      <div className="result-section">
                        <h3>🧬 ДНК АВТОРА (на основе {analysis.videos?.length || 3} видео)</h3>
                        <div className="dna-analysis">
                          {analysis.dnaAnalysis.structuralPatterns && analysis.dnaAnalysis.structuralPatterns.length > 0 && (
                            <div className="dna-section">
                              <h4>1️⃣ Структурные паттерны</h4>
                              <p className="dna-subtitle">(что повторяется в каждом видео)</p>
                              <ul>
                                {analysis.dnaAnalysis.structuralPatterns.map((pattern: string, i: number) => (
                                  <li key={i}>{pattern}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {analysis.dnaAnalysis.speechFormula && Object.keys(analysis.dnaAnalysis.speechFormula).length > 0 && (
                            <div className="dna-section">
                              <h4>2️⃣ Речевая формула</h4>
                              <p className="dna-subtitle">(измеримые характеристики)</p>
                              <ul>
                                {analysis.dnaAnalysis.speechFormula.speedRange && (
                                  <li>Скорость речи: {analysis.dnaAnalysis.speechFormula.speedRange}</li>
                                )}
                                {analysis.dnaAnalysis.speechFormula.speedVariation && (
                                  <li>Разброс скорости: {analysis.dnaAnalysis.speechFormula.speedVariation}</li>
                                )}
                                {analysis.dnaAnalysis.speechFormula.emotionalTone && (
                                  <li>Эмоциональный тон: {analysis.dnaAnalysis.speechFormula.emotionalTone}</li>
                                )}
                                {analysis.dnaAnalysis.speechFormula.personalFormulations && (
                                  <li>Использование личных формулировок: {analysis.dnaAnalysis.speechFormula.personalFormulations}</li>
                                )}
                              </ul>
                            </div>
                          )}

                          {analysis.dnaAnalysis.consistency && analysis.dnaAnalysis.consistency.length > 0 && (
                            <div className="dna-section">
                              <h4>3️⃣ Консистентность</h4>
                              <p className="dna-subtitle">(докажи, что это не случайность)</p>
                              <ul>
                                {analysis.dnaAnalysis.consistency.map((item: string, i: number) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {analysis.dnaAnalysis.variability && analysis.dnaAnalysis.variability.length > 0 && (
                            <div className="dna-section">
                              <h4>4️⃣ Вариативность</h4>
                              <p className="dna-subtitle">(что меняется, а что нет)</p>
                              <ul>
                                {analysis.dnaAnalysis.variability.map((item: string, i: number) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {analysis.dnaAnalysis.productConclusion && (
                            <div className="dna-section dna-conclusion">
                              <h4>5️⃣ Продуктовый вывод</h4>
                              <p className="dna-conclusion-text">{analysis.dnaAnalysis.productConclusion}</p>
                            </div>
                          )}

                          {analysis.dnaAnalysis.dnaUsage && analysis.dnaAnalysis.dnaUsage.length > 0 && (
                            <div className="dna-section">
                              <h4>6️⃣ Как ДНК используется в генерации контента</h4>
                              <p className="dna-subtitle">(явная связка анализа → генерация)</p>
                              <div className="dna-usage">
                                <p>При генерации нового сценария мы ОБЯЗАНЫ:</p>
                                <ul>
                                  {analysis.dnaAnalysis.dnaUsage.map((item: string, i: number) => (
                                    <li key={i}>
                                      <span className="dna-check">✓</span> {item.replace(/^При генерации (мы ОБЯЗАНЫ|нового сценария мы ОБЯЗАНЫ) /, '')}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}

                          {analysis.profileAnalysis && (
                            <div className="dna-section">
                              <h4>🔗 Связка видео и профиля</h4>
                              <p className="dna-subtitle">(как профиль связан с видео)</p>
                              <div className="profile-video-link">
                                <ul>
                                  <li>Видео выполняет роль входной точки</li>
                                  <li>Профиль = точка углубления</li>
                                  {analysis.profileAnalysis.ctaType === 'внешний (уводит трафик)' && (
                                    <li>CTA в видео намеренно неявный, т.к. основной призыв вынесен в профиль</li>
                                  )}
                                  {analysis.profileAnalysis.profileAsExtension && (
                                    <li>Профиль используется как продолжение видео (да)</li>
                                  )}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Транскрипция */}
                <div className="result-section">
                  <h3>Транскрипция</h3>
                  <div className="transcript-box">
                    <p>{analysis.transcript || 'Транскрипция не доступна'}</p>
                  </div>
                </div>

                {/* Паспорт стиля */}
                <div className="result-section">
                  <h3>Паспорт стиля автора</h3>
                  
                  <div className="passport-grid">
                    <div className="passport-card">
                      <h4>Структура</h4>
                      <div className="passport-content">
                        <p><strong>Хук:</strong> {analysis.stylePassport.structure.hook}</p>
                        <p><strong>Завязка:</strong> {analysis.stylePassport.structure.setup}</p>
                        <p><strong>Основная часть:</strong> {analysis.stylePassport.structure.main}</p>
                        <p><strong>Кульминация:</strong> {analysis.stylePassport.structure.climax}</p>
                        <p><strong>CTA:</strong> {analysis.stylePassport.structure.cta}</p>
                      </div>
                    </div>

                    <div className="passport-card">
                      <h4>Стиль речи</h4>
                      <div className="passport-content">
                        <p><strong>Скорость:</strong> {analysis.stylePassport.toneOfVoice.speechRate}</p>
                        <p><strong>Эмоция:</strong> {analysis.stylePassport.toneOfVoice.emotionalTone}</p>
                        <p><strong>Стиль:</strong> {analysis.stylePassport.toneOfVoice.style}</p>
                        <div className="phrases">
                          <strong>Типичные фразы:</strong>
                          <ul>
                            {analysis.stylePassport.toneOfVoice.typicalPhrases.map((phrase, i) => (
                              <li key={i}>{phrase}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="passport-card">
                      <h4>Визуальный контекст</h4>
                      <div className="passport-content">
                        <p><strong>Место:</strong> {analysis.stylePassport.visualContext.setting}</p>
                        <p><strong>Темп:</strong> {analysis.stylePassport.visualContext.pacing}</p>
                        <div className="elements">
                          <strong>Элементы:</strong>
                          <ul>
                            {analysis.stylePassport.visualContext.keyElements.map((el, i) => (
                              <li key={i}>{el}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="passport-card">
                      <h4>Инсайты</h4>
                      <div className="passport-content">
                        <div className="insights-section">
                          <strong>Крючки удержания:</strong>
                          <ul>
                            {analysis.stylePassport.insights.retentionHooks.map((hook, i) => (
                              <li key={i}>{hook}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="insights-section">
                          <strong>Паттерны:</strong>
                          <ul>
                            {analysis.stylePassport.insights.patterns.map((pattern, i) => (
                              <li key={i}>{pattern}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="insights-section">
                          <strong>Уникальные элементы:</strong>
                          <ul>
                            {analysis.stylePassport.insights.uniqueElements.map((el, i) => (
                              <li key={i}>{el}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
      </div>
              </section>

              {/* Генерация сценария */}
              <section className="card">
                <h2>
                  <FileText className="section-icon" />
                  Генерация нового сценария
                </h2>
                <div className="script-generator">
                  <div className="input-group">
                    <input
                      type="text"
                      value={scriptTopic}
                      onChange={(e) => setScriptTopic(e.target.value)}
                      placeholder="Введите тему для нового видео (например: 'Обзор нового iPhone')"
                      className="input"
                    />
                    <button
                      onClick={handleGenerateScript}
                      disabled={generatingScript || !scriptTopic.trim()}
                      className="btn btn-primary"
                    >
                      {generatingScript ? (
                        <>
                          <Loader2 className="spinner" />
                          Генерация...
                        </>
                      ) : (
                        <>
                          <Sparkles />
                          Сгенерировать сценарий
                        </>
                      )}
                    </button>
                  </div>

                  {/* Варианты сценариев */}
                  {generatedScripts.length > 0 && (
                    <div className="script-variants">
                      <h3>Варианты сценариев (A/B/C):</h3>
                      {generatedScripts.map((script, index) => {
                        const hook = extractHookFromScript(script);
                        return (
                          <div key={index} className="script-variant">
                            <div className="variant-header">
                              <h4>Вариант {String.fromCharCode(65 + index)}</h4>
                              <button
                                onClick={() => handleCopyScript(script, index)}
                                className="btn btn-small"
                                title="Скопировать сценарий"
                              >
                                {copiedScriptIndex === index ? (
                                  <>
                                    <Check size={16} />
                                    Скопировано
                                  </>
                                ) : (
                                  <>
                                    <Copy size={16} />
                                    Копировать
                                  </>
                                )}
                              </button>
                            </div>
                            {hook && (
                              <div className="hook-section">
                                <div className="hook-display">
                                  <strong>Хук:</strong> "{hook}"
                                </div>
                                {hookAnalysis[hook] && (
                                  <div className="hook-analysis">
                                    <div className="hook-analysis-text">
                                      <strong>Анализ:</strong> {hookAnalysis[hook].analysis}
                                    </div>
                                    {hookAnalysis[hook].pluses.length > 0 && (
                                      <div className="hook-pluses">
                                        <strong>✅ Плюсы:</strong>
                                        <ul>
                                          {hookAnalysis[hook].pluses.map((plus, i) => (
                                            <li key={i}>{plus}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {hookAnalysis[hook].minuses.length > 0 && (
                                      <div className="hook-minuses">
                                        <strong>⚠️ Минусы:</strong>
                                        <ul>
                                          {hookAnalysis[hook].minuses.map((minus, i) => (
                                            <li key={i}>{minus}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="script-box">
                              <pre>{script}</pre>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      <footer className="footer">
        <p>Grozplexity Hackathon 2025</p>
      </footer>
    </div>
  );
}

export default App;
