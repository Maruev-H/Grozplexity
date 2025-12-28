import { useState } from 'react';
import axios from 'axios';
import { Upload, Video, Sparkles, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react';
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
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptTopic, setScriptTopic] = useState('');
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setAnalysis(null);
      setGeneratedScript(null);
    }
  };

  const handleUpload = async () => {
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
  };

  const handleGenerateScript = async () => {
    if (!scriptTopic.trim() || !analysis) {
      setError('Введите тему для сценария');
      return;
    }

    setGeneratingScript(true);
    setError(null);
    setGeneratedScript(null);

    try {
      const response = await axios.post(`${API_URL}/video/generate-script`, {
        topic: scriptTopic,
        stylePassport: analysis.stylePassport,
      });
      setGeneratedScript(response.data.script);
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
            <div className="upload-area">
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

                  {generatedScript && (
                    <div className="script-result">
                      <h3>Готовый сценарий:</h3>
                      <div className="script-box">
                        <pre>{generatedScript}</pre>
                      </div>
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
