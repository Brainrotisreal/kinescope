import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  const [url, setUrl] = useState('');
  const [downloadDir, setDownloadDir] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('bestvideo+bestaudio/best');

  const [videoInfo, setVideoInfo] = useState(null);
  const [dependencies, setDependencies] = useState({ ffmpeg: true, ffmpeg_path: null, yt_dlp: true });
  const [ffmpegInstallDir, setFfmpegInstallDir] = useState('');
  const [ffmpegError, setFfmpegError] = useState('');

  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(null);

  const [error, setError] = useState('');
  const [completionState, setCompletionState] = useState(null); // null | 'animating' | 'done'
  const [completionText, setCompletionText] = useState('');

  const canvasRef = useRef(null);
  const completionPhaseRef = useRef(null); // 'noise' | 'lock' | 'hold' | null
  const completionStartTimeRef = useRef(0);

  const recheckDeps = async () => {
    if (window.pywebview?.api) {
      try {
        const deps = await window.pywebview.api.check_dependencies();
        setDependencies(deps);
      } catch (err) {
        console.error('Failed to recheck dependencies:', err);
      }
    }
  };

  const resetToIdle = () => {
    setCompletionState(null);
    setCompletionText('');
    setUrl('');
    setVideoInfo(null);
    setProgress(null);
    setError('');
  };

  // Mount: initialize, check deps, load settings
  useEffect(() => {
    async function init() {
      if (window.pywebview?.api) {
        try {
          const [defaultDir, deps, defaultFfmpegDir, settings] = await Promise.all([
            window.pywebview.api.get_default_download_dir(),
            window.pywebview.api.check_dependencies(),
            window.pywebview.api.get_default_ffmpeg_dir(),
            window.pywebview.api.load_settings(),
          ]);
          setDownloadDir(settings.download_dir || defaultDir);
          setDependencies(deps);
          setFfmpegInstallDir(defaultFfmpegDir);
        } catch (err) {
          setError('Failed to initialize: ' + err.message);
        }
      } else {
        setDownloadDir('C:\\Users\\MockUser\\Downloads');
        setFfmpegInstallDir('C:\\Users\\MockUser\\AppData\\Local\\Kinescope\\bin');
      }
    }

    if (window.pywebview) {
      init();
    } else {
      window.addEventListener('pywebviewready', init);
    }
    return () => window.removeEventListener('pywebviewready', init);
  }, []);

  // Progress listener
  useEffect(() => {
    window.onDownloadProgress = (data) => {
      setProgress(data);
      if (data.status === 'completed') {
        setIsDownloading(false);
        setCompletionState('animating');
        if (data.ffmpeg_path && window.pywebview?.api) {
          window.pywebview.api.save_setting('ffmpeg_path', data.ffmpeg_path);
        }
        recheckDeps();
      } else if (data.status === 'error') {
        setIsDownloading(false);
        setError(data.message);
        recheckDeps();
      }
    };
    return () => { delete window.onDownloadProgress; };
  }, []);

  // URL debounce → scan
  useEffect(() => {
    const isWebUrl = (s) => {
      try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch (_) {
        return false;
      }
    };
    if (isWebUrl(url)) {
      const t = setTimeout(() => handleScanInfo(url), 800);
      return () => clearTimeout(t);
    } else {
      setVideoInfo(null);
    }
  }, [url]);

  // Completion animation phases
  useEffect(() => {
    if (completionState !== 'animating') return;

    completionPhaseRef.current = 'noise';
    completionStartTimeRef.current = performance.now();

    const fullText = 'SIGNAL ACQUIRED — TRANSMISSION COMPLETE';
    let charIdx = 0;
    setCompletionText('');

    const printInterval = setInterval(() => {
      charIdx++;
      setCompletionText(fullText.slice(0, charIdx));
      if (charIdx >= fullText.length) clearInterval(printInterval);
    }, 38);

    const t1 = setTimeout(() => { completionPhaseRef.current = 'lock'; }, 400);
    const t2 = setTimeout(() => { completionPhaseRef.current = 'hold'; }, 1200);
    const t3 = setTimeout(() => {
      completionPhaseRef.current = null;
      setCompletionState('done');
    }, 2800);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearInterval(printInterval);
      completionPhaseRef.current = null;
    };
  }, [completionState]);

  // Canvas oscilloscope
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let phase = 0;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const drawGrid = () => {
      ctx.strokeStyle = '#141822';
      ctx.lineWidth = 1;
      const gridSize = 16;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
      ctx.strokeStyle = '#222b3b';
      ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
    };

    const drawCompletionWave = (phaseLabel) => {
      const elapsed = performance.now() - completionStartTimeRef.current;
      const cy = canvas.height / 2;
      let color, amplitude, frequency, noiseAmount;

      if (phaseLabel === 'noise') {
        const t = Math.min(elapsed / 400, 1);
        amplitude = 8 + t * 28;
        frequency = 0.08 + t * 0.08;
        noiseAmount = t * 14;
        color = '#d97706';
      } else if (phaseLabel === 'lock') {
        const t = Math.min((elapsed - 400) / 800, 1);
        amplitude = 36 * Math.pow(1 - t, 2) + 4;
        frequency = 0.18 * (1 - t) + 0.025;
        noiseAmount = (1 - t) * 10;
        // Amber → green color interpolation
        const r = Math.round(217 * (1 - t) + 16 * t);
        const g = Math.round(119 * (1 - t) + 185 * t);
        const b = Math.round(6 * (1 - t) + 129 * t);
        color = `rgb(${r},${g},${b})`;
        // Lock line fades in as wave settles
        if (t > 0.4) {
          const lineAlpha = Math.min((t - 0.4) / 0.6, 1) * 0.3;
          ctx.strokeStyle = `rgba(16,185,129,${lineAlpha})`;
          ctx.lineWidth = 1;
          ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(canvas.width, cy); ctx.stroke();
        }
      } else {
        // hold
        amplitude = 5;
        frequency = 0.025;
        noiseAmount = 0;
        color = '#10b981';
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const n = noiseAmount > 0 ? (Math.random() - 0.5) * noiseAmount : 0;
        const y = cy + Math.sin(x * frequency + phase) * amplitude + n;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid();

      const completionPhase = completionPhaseRef.current;
      let speed = 0.05;

      if (completionPhase) {
        speed = 0.03;
        drawCompletionWave(completionPhase);
      } else {
        let color = '#d97706';
        let amplitude = 8;
        let frequency = 0.02;

        if (isLoadingInfo) {
          color = '#3b82f6';
          amplitude = 12;
          frequency = 0.08;
          speed = 0.2;
        } else if (isDownloading) {
          color = '#10b981';
          amplitude = 16;
          frequency = 0.15;
          speed = 0.35;
          if (progress?.status === 'merging' || progress?.status === 'processing') {
            color = '#8b5cf6';
            amplitude = 5;
            frequency = 0.03;
            speed = 0.08;
          }
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
          let y = canvas.height / 2;
          if (isLoadingInfo) {
            const sweepX = (phase * 12) % canvas.width;
            const dist = Math.abs(x - sweepX);
            const scanAmp = dist < 60 ? ((60 - dist) / 60) * amplitude : 0;
            y += Math.sin(x * frequency + phase) * scanAmp;
          } else if (isDownloading && progress?.status === 'downloading') {
            y += Math.sin(x * frequency - phase) * amplitude * (0.6 + Math.sin(phase * 2) * 0.2 + Math.random() * 0.2);
          } else {
            y += Math.sin(x * frequency + phase) * amplitude;
          }
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      phase += speed;
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isDownloading, isLoadingInfo, progress, completionState]);

  // Handlers
  const handleScanInfo = async (scanUrl) => {
    setError('');
    setIsLoadingInfo(true);
    if (window.pywebview?.api) {
      try {
        const info = await window.pywebview.api.get_video_info(scanUrl);
        if (info.success) {
          setVideoInfo(info);
          setSelectedFormat(info.formats?.[0]?.id ?? 'bestvideo+bestaudio/best');
        } else {
          setError(info.error || 'Failed to scan URL metadata.');
        }
      } catch (err) {
        setError('Error connecting to backend: ' + err.message);
      } finally {
        setIsLoadingInfo(false);
      }
    } else {
      setTimeout(() => {
        setVideoInfo({
          title: 'Vaporwave Archival Broadcast [1989]',
          uploader: 'SynthWave Collective',
          duration: '04:20',
          thumbnail: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=120&fit=crop',
          formats: [
            { id: 'bestvideo+bestaudio/best', note: 'Best Quality (Default)' },
            { id: 'bestvideo[height<=1080]+bestaudio/best', note: '1080p FHD' },
            { id: 'bestaudio/best', note: 'Audio Only (MP3)' }
          ]
        });
        setIsLoadingInfo(false);
      }, 1000);
    }
  };

  const handleBrowseDir = async () => {
    if (window.pywebview?.api) {
      try {
        const path = await window.pywebview.api.select_folder();
        if (path) {
          setDownloadDir(path);
          window.pywebview.api.save_setting('download_dir', path);
        }
      } catch (err) {
        setError('Folder picker failed: ' + err.message);
      }
    }
  };

  const handleStartArchival = async () => {
    if (!url || !downloadDir) return;
    setError('');
    setIsDownloading(true);
    setProgress({ status: 'starting', percent: 0, message: 'Contacting host stream...' });
    if (window.pywebview?.api) {
      try {
        await window.pywebview.api.start_download(url, downloadDir, selectedFormat);
      } catch (err) {
        setError('Extraction trigger failed: ' + err.message);
        setIsDownloading(false);
      }
    } else {
      // Mock download for browser testing
      let pct = 0;
      const interval = setInterval(() => {
        pct += 10;
        setProgress({ status: 'downloading', percent: pct, speed: '12.4 MB/s', eta: `00:${10 - pct / 10}`, downloaded: `${pct} MB`, total: '100 MB', filename: 'vaporwave_broadcast.mp4' });
        if (pct >= 100) {
          clearInterval(interval);
          setProgress({ status: 'merging', percent: 100, message: 'Processing stream components...' });
          setTimeout(() => {
            setIsDownloading(false);
            setCompletionState('animating');
            setUrl('');
            setVideoInfo(null);
          }, 1500);
        }
      }, 500);
    }
  };

  const handleBrowseFfmpegDir = async () => {
    if (window.pywebview?.api) {
      try {
        const path = await window.pywebview.api.select_folder();
        if (path) setFfmpegInstallDir(path);
      } catch (err) {
        setFfmpegError('Folder picker failed: ' + err.message);
      }
    }
  };

  const handleSelectFfmpegExe = async () => {
    if (!window.pywebview?.api) return;
    setFfmpegError('');
    try {
      const path = await window.pywebview.api.select_file();
      if (!path) return;
      const result = await window.pywebview.api.validate_ffmpeg_exe(path);
      if (result.valid) {
        await window.pywebview.api.save_setting('ffmpeg_path', path);
        await recheckDeps();
      } else {
        setFfmpegError(result.error || 'Not a valid FFmpeg executable.');
      }
    } catch (err) {
      setFfmpegError('Selection failed: ' + err.message);
    }
  };

  const handleInstallFfmpeg = async () => {
    setFfmpegError('');
    setIsDownloading(true);
    setProgress({ status: 'downloading', percent: 0, speed: '0.0 MB/s', downloaded: '0.0 MB', total: '~50 MB', filename: 'ffmpeg.zip', message: 'Contacting GitHub to download FFmpeg...' });
    if (window.pywebview?.api) {
      try {
        await window.pywebview.api.install_ffmpeg(ffmpegInstallDir);
      } catch (err) {
        setError('FFmpeg install failed: ' + err.message);
        setIsDownloading(false);
      }
    } else {
      let pct = 0;
      const interval = setInterval(() => {
        pct += 20;
        setProgress({ status: 'downloading', percent: pct, speed: '4.8 MB/s', downloaded: `${(50 * pct) / 100} MB`, total: '50 MB', filename: 'ffmpeg.zip', message: 'Downloading FFmpeg binary (Mock)...' });
        if (pct >= 100) {
          clearInterval(interval);
          setProgress({ status: 'merging', percent: 100, message: 'Extracting zip components...' });
          setTimeout(() => {
            setIsDownloading(false);
            setCompletionState('animating');
            setDependencies({ ffmpeg: true, ffmpeg_path: 'C:\\mock\\bin\\ffmpeg.exe', yt_dlp: true });
          }, 1500);
        }
      }, 400);
    }
  };

  const handleCancelDownload = async () => {
    if (window.pywebview?.api) {
      try {
        await window.pywebview.api.cancel_download();
        setProgress(prev => ({ ...prev, message: 'ABORTING TRANSMISSION...' }));
      } catch (err) {
        console.error('Cancel failed:', err);
      }
    } else {
      setIsDownloading(false);
      setError('Extraction aborted by user.');
    }
  };

  // Render helpers
  const renderProgressCard = () => (
    <div className="progress-card">
      <div className="progress-header">
        <div className="progress-state">
          <span className="progress-state-dot"></span>
          <span>{progress?.message || 'ARCHIVING BROADCAST'}</span>
        </div>
        <div className="progress-eta">
          {progress?.status === 'downloading' && progress.eta && progress.eta !== 'N/A'
            ? `ETA: ${progress.eta}` : '--:--'}
        </div>
      </div>
      <div className="meter-container">
        <div className="meter-fill" style={{ width: `${progress?.percent ?? 0}%` }} />
      </div>
      <div className="progress-telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">RATE</span>
          <span className="telemetry-val">{progress?.status === 'downloading' ? progress.speed : '—'}</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">TRANSFER</span>
          <span className="telemetry-val">
            {progress?.status === 'downloading' && progress.downloaded
              ? `${progress.downloaded} / ${progress.total}` : '—'}
          </span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">PROGRESS</span>
          <span className="telemetry-val">{progress ? `${Math.round(progress.percent)}%` : '0%'}</span>
        </div>
      </div>
      {dependencies.ffmpeg && (
        <button className="cancel-btn" onClick={handleCancelDownload}>
          ABORT EXTRACTION
        </button>
      )}
    </div>
  );

  const renderFfmpegPanel = () => (
    <div className="ffmpeg-panel">
      <div className="ffmpeg-panel-header">
        <span className="status-indicator warning" style={{ width: '5px', height: '5px', flexShrink: 0 }}></span>
        <span>FFMPEG NOT DETECTED</span>
      </div>
      <div className="ffmpeg-panel-body">
        <div className="ffmpeg-option">
          <div className="ffmpeg-option-label">HAVE FFMPEG?</div>
          <button className="browse-btn ffmpeg-opt-btn" onClick={handleSelectFfmpegExe}>
            BROWSE .EXE
          </button>
          <div className="ffmpeg-option-hint">Point to existing ffmpeg.exe</div>
        </div>
        <div className="ffmpeg-divider">OR</div>
        <div className="ffmpeg-option">
          <div className="ffmpeg-option-label">AUTO-INSTALL</div>
          <button className="banner-action-btn ffmpeg-opt-btn" onClick={handleInstallFfmpeg}>
            DOWNLOAD
          </button>
          <div className="ffmpeg-option-hint">INSTALL TO:</div>
          <div className="directory-row" style={{ width: '100%' }}>
            <button
              className="browse-btn"
              onClick={handleBrowseFfmpegDir}
              style={{ fontSize: '0.55rem', padding: '0 8px', height: '26px' }}
            >
              DIR
            </button>
            <input
              type="text"
              className="input-bar"
              value={ffmpegInstallDir}
              onChange={(e) => setFfmpegInstallDir(e.target.value)}
              style={{ fontSize: '0.62rem', padding: '2px 8px', height: '26px' }}
            />
          </div>
        </div>
      </div>
      {ffmpegError && <div className="ffmpeg-error-line">{ffmpegError}</div>}
    </div>
  );

  const renderActionContent = () => {
    if (isDownloading) return renderProgressCard();

    if (completionState === 'animating') {
      return (
        <div className="completion-readout">
          <span className="completion-text">{completionText}</span>
          <span className="completion-cursor">_</span>
        </div>
      );
    }

    if (completionState === 'done') {
      return (
        <div className="completion-done">
          <div className="completion-done-label">TRANSMISSION COMPLETE</div>
          <button className="btn-ghost" onClick={resetToIdle}>NEW TRANSMISSION</button>
        </div>
      );
    }

    if (!dependencies.ffmpeg) return renderFfmpegPanel();

    return (
      <>
        {error && (
          <div className="action-error">
            <strong>FAULT //</strong> {error}
          </div>
        )}
        {videoInfo?.formats && (
          <div className="input-group">
            <label className="input-label">DECRYPTION FORMAT</label>
            <select
              className="select-dropdown"
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
            >
              {videoInfo.formats.map((f) => (
                <option key={f.id} value={f.id}>{f.note}</option>
              ))}
            </select>
          </div>
        )}
        <button
          className="engage-btn"
          disabled={!url || !downloadDir || isLoadingInfo}
          onClick={handleStartArchival}
        >
          ENGAGE EXTRACTION
        </button>
      </>
    );
  };

  return (
    <div className="deck-container">
      {/* Header */}
      <header className="deck-header">
        <div className="deck-title-group">
          <h1 className="deck-title">KINESCOPE<span>//</span></h1>
          <span className="deck-subtitle">STREAM ARCHIVAL DECK</span>
        </div>
        <div className="system-status-group">
          <div className="system-status">
            <span className={`status-indicator ${dependencies.ffmpeg ? 'ready' : 'warning'}`}></span>
            <span className="status-label">
              {dependencies.ffmpeg ? 'FFMPEG: ACTIVE' : 'FFMPEG: MISSING'}
            </span>
          </div>
          {dependencies.ffmpeg && dependencies.ffmpeg_path && (
            <div className="ffmpeg-path-label" title={dependencies.ffmpeg_path}>
              {dependencies.ffmpeg_path}
            </div>
          )}
        </div>
      </header>

      {/* Oscilloscope */}
      <div className="oscilloscope-card">
        <canvas ref={canvasRef} className="oscilloscope-canvas" />
        <div className="screen-overlay" />
        <div className="telemetry-readout">
          <div className="thumbnail-frame">
            {videoInfo?.thumbnail ? (
              <img src={videoInfo.thumbnail} className="thumbnail-img" alt="Video Thumbnail" />
            ) : (
              <div className="thumbnail-placeholder">
                {isLoadingInfo ? 'SCANNING...' : 'NO CARRIER'}
              </div>
            )}
          </div>
          <div className="meta-details">
            <div className="meta-title">
              {videoInfo ? videoInfo.title : (isLoadingInfo ? 'POLLING SOURCE STREAM...' : 'DECK IDLE // AWAITING URL')}
            </div>
            <div className="meta-uploader">
              {videoInfo ? videoInfo.uploader : 'SOURCE: UNKNOWN'}
            </div>
            <div className="meta-duration">
              {videoInfo ? `DURATION // ${videoInfo.duration}` : 'DURATION: 00:00'}
            </div>
          </div>
        </div>
      </div>

      {/* Input Deck */}
      <main className="control-deck">
        <div className="input-group">
          <label className="input-label">BROADCAST SOURCE URL</label>
          <input
            type="text"
            className="input-bar"
            placeholder="Paste link from YouTube, Vimeo, TikTok, X, Soundcloud..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isDownloading}
          />
          <span className="input-hint">Supports YouTube, Vimeo, TikTok, Soundcloud, and 1000+ other media sources.</span>
        </div>

        <div className="input-group">
          <label className="input-label">DESTINATION DIRECTORY</label>
          <div className="directory-row">
            <button className="browse-btn" onClick={handleBrowseDir} disabled={isDownloading}>
              BROWSE
            </button>
            <input
              type="text"
              className="input-bar"
              placeholder="Select folder or paste directory path..."
              value={downloadDir}
              onChange={(e) => setDownloadDir(e.target.value)}
              disabled={isDownloading}
            />
          </div>
        </div>

        <div className="action-area">
          {renderActionContent()}
        </div>
      </main>
    </div>
  );
}
