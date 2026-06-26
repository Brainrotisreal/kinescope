import os
import sys
import json
import threading
import subprocess
import urllib.request
import zipfile
import io
import shutil
import time
import webview
from webview import FileDialog
import yt_dlp

class Api:
    def __init__(self):
        self._window = None
        self._custom_ffmpeg_dir = None
        self._custom_ffmpeg_exe = None  # full path to ffmpeg executable

    def _get_ffmpeg_name(self):
        return 'ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg'

    def _get_ffprobe_name(self):
        return 'ffprobe.exe' if sys.platform == 'win32' else 'ffprobe'

    def _get_bin_dir(self):
        """Returns the local bin folder path (persisted outside temp folder)."""
        if getattr(sys, 'frozen', False):
            exe_dir = os.path.dirname(sys.executable)
        else:
            exe_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(exe_dir, 'bin')

    def _get_settings_path(self):
        """Returns path to settings.json, next to the exe or at project root."""
        return os.path.join(os.path.dirname(self._get_bin_dir()), 'settings.json')

    def load_settings(self):
        """Reads settings.json and populates internal ffmpeg state. Never raises."""
        try:
            path = self._get_settings_path()
            if not os.path.exists(path):
                return {'ffmpeg_path': None, 'download_dir': None}
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            ffmpeg_path = data.get('ffmpeg_path')
            if ffmpeg_path and os.path.exists(ffmpeg_path):
                self._custom_ffmpeg_exe = ffmpeg_path
                self._custom_ffmpeg_dir = os.path.dirname(ffmpeg_path)
            else:
                ffmpeg_path = None
            return {
                'ffmpeg_path': ffmpeg_path,
                'download_dir': data.get('download_dir'),
            }
        except Exception:
            return {'ffmpeg_path': None, 'download_dir': None}

    def save_setting(self, key, value):
        """Persists a single key to settings.json."""
        valid_keys = {'ffmpeg_path', 'download_dir'}
        if key not in valid_keys:
            return {'success': False, 'error': f'Unknown key: {key}'}
        try:
            path = self._get_settings_path()
            data = {}
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            data[key] = value
            parent = os.path.dirname(path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def check_dependencies(self):
        """Checks if ffmpeg is available in any known location."""
        ffmpeg_path = None
        ffmpeg_name = self._get_ffmpeg_name()

        # 1. Settings-saved exe (most authoritative)
        if self._custom_ffmpeg_exe and os.path.exists(self._custom_ffmpeg_exe):
            ffmpeg_path = self._custom_ffmpeg_exe

        # 2. System PATH
        if not ffmpeg_path:
            system_ffmpeg = shutil.which('ffmpeg')
            if system_ffmpeg:
                ffmpeg_path = system_ffmpeg

        # 3. Default local bin folder
        if not ffmpeg_path:
            local = os.path.join(self._get_bin_dir(), ffmpeg_name)
            if os.path.exists(local):
                ffmpeg_path = local

        # 4. Custom dir from current session
        if not ffmpeg_path and self._custom_ffmpeg_dir:
            local = os.path.join(self._custom_ffmpeg_dir, ffmpeg_name)
            if os.path.exists(local):
                ffmpeg_path = local

        return {
            'ffmpeg': ffmpeg_path is not None,
            'ffmpeg_path': ffmpeg_path,
            'yt_dlp': True,
        }

    def get_default_ffmpeg_dir(self):
        """Returns the default directory where ffmpeg would be installed locally."""
        return self._get_bin_dir()

    def select_folder(self):
        """Opens native directory selector dialog."""
        if not self._window:
            return None
        result = self._window.create_file_dialog(FileDialog.FOLDER)
        if result and len(result) > 0:
            return result[0]
        return None

    def select_file(self):
        """Opens native file picker for selecting an existing executable."""
        if not self._window:
            return None
        if sys.platform == 'win32':
            file_types = ('Executable (*.exe)', 'All files (*.*)')
        else:
            file_types = ('All files (*.*)',)
        result = self._window.create_file_dialog(
            FileDialog.OPEN,
            file_types=file_types
        )
        if result and len(result) > 0:
            return result[0]
        return None

    def validate_ffmpeg_exe(self, path):
        """Validates that the given path is a working ffmpeg executable."""
        try:
            if not os.path.isfile(path):
                return {'valid': False, 'error': 'File does not exist.'}
            result = subprocess.run(
                [path, '-version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            output = (result.stdout + result.stderr).lower()
            if result.returncode == 0 and 'ffmpeg' in output:
                self._custom_ffmpeg_exe = path
                self._custom_ffmpeg_dir = os.path.dirname(path)
                return {'valid': True}
            return {'valid': False, 'error': 'File did not respond as ffmpeg.'}
        except subprocess.TimeoutExpired:
            return {'valid': False, 'error': 'Timed out — not an ffmpeg executable.'}
        except Exception as e:
            return {'valid': False, 'error': str(e)}

    def get_default_download_dir(self):
        """Returns the system default Downloads folder."""
        return os.path.join(os.path.expanduser('~'), 'Downloads')

    def get_video_info(self, url):
        """Extracts video metadata without downloading."""
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

                if 'entries' in info:
                    return {
                        'success': False,
                        'error': 'Playlists are not supported yet. Please paste a single video URL.'
                    }

                duration_secs = info.get('duration', 0)
                minutes = duration_secs // 60
                seconds = duration_secs % 60
                duration_str = f"{minutes:02d}:{seconds:02d}"

                formats = [
                    {'id': 'bestvideo+bestaudio/best', 'note': 'Best Quality (Default)'},
                    {'id': 'bestvideo[height<=1080]+bestaudio/best', 'note': '1080p FHD'},
                    {'id': 'bestvideo[height<=720]+bestaudio/best', 'note': '720p HD'},
                    {'id': 'bestvideo[height<=480]+bestaudio/best', 'note': '480p SD'},
                    {'id': 'bestaudio/best', 'note': 'Audio Only (MP3)'}
                ]

                return {
                    'success': True,
                    'title': info.get('title', 'Unknown Title'),
                    'uploader': info.get('uploader', 'Unknown Creator'),
                    'duration': duration_str,
                    'thumbnail': info.get('thumbnail', ''),
                    'formats': formats
                }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def start_download(self, url, download_dir, format_id):
        """Launches video download in a separate thread."""
        thread = threading.Thread(target=self._download_worker, args=(url, download_dir, format_id))
        thread.daemon = True
        thread.start()
        return {'status': 'started'}

    def install_ffmpeg(self, target_dir=''):
        """Launches automatic local FFmpeg downloader in a separate thread."""
        install_dir = target_dir.strip() if target_dir and target_dir.strip() else self._get_bin_dir()
        self._custom_ffmpeg_dir = install_dir
        thread = threading.Thread(target=self._ffmpeg_downloader_worker, args=(install_dir,))
        thread.daemon = True
        thread.start()
        return {'status': 'started'}

    def _ffmpeg_downloader_worker(self, bin_dir):
        """Downloads the latest FFmpeg static binary from GitHub and extracts it locally."""
        try:
            self._send_progress({
                'status': 'downloading',
                'percent': 0,
                'speed': '0.0 MB/s',
                'downloaded': '0.0 MB',
                'total': '~50 MB',
                'filename': 'ffmpeg.zip',
                'message': 'Downloading FFmpeg archive...'
            })

            # Select download target based on platform
            if sys.platform == 'darwin':
                url = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-osx64-gpl.zip"
                bin_names = ['ffmpeg', 'ffprobe']
            else:
                # Windows (win32) and other platforms default
                url = "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
                bin_names = ['ffmpeg.exe', 'ffprobe.exe']

            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                block_size = 512 * 1024
                zip_data = io.BytesIO()
                start_time = time.time()

                while True:
                    buffer = response.read(block_size)
                    if not buffer:
                        break
                    downloaded += len(buffer)
                    zip_data.write(buffer)

                    elapsed = time.time() - start_time
                    speed_val = downloaded / elapsed if elapsed > 0 else 0
                    speed_str = (f"{speed_val / (1024 * 1024):.1f} MB/s"
                                 if speed_val > 1024 * 1024
                                 else f"{speed_val / 1024:.1f} KB/s")
                    percent = (downloaded / total_size * 100) if total_size > 0 else 0

                    self._send_progress({
                        'status': 'downloading',
                        'percent': percent,
                        'speed': speed_str,
                        'downloaded': f"{downloaded / (1024 * 1024):.1f} MB",
                        'total': f"{total_size / (1024 * 1024):.1f} MB",
                        'filename': 'ffmpeg.zip',
                        'message': 'Downloading FFmpeg binary...'
                    })

            self._send_progress({
                'status': 'merging',
                'percent': 100,
                'message': 'Extracting FFmpeg binaries...'
            })

            os.makedirs(bin_dir, exist_ok=True)

            zip_data.seek(0)
            with zipfile.ZipFile(zip_data) as zip_file:
                for member in zip_file.namelist():
                    filename = os.path.basename(member)
                    if filename in bin_names:
                        source = zip_file.open(member)
                        target_path = os.path.join(bin_dir, filename)
                        with open(target_path, "wb") as target:
                            shutil.copyfileobj(source, target)
                        
                        # Set executable permissions on macOS / Unix platforms
                        if sys.platform != 'win32':
                            st = os.stat(target_path)
                            os.chmod(target_path, st.st_mode | 0o111)

            installed_path = os.path.join(bin_dir, bin_names[0])
            self._custom_ffmpeg_exe = installed_path

            self._send_progress({
                'status': 'completed',
                'percent': 100,
                'message': 'FFmpeg successfully installed!',
                'ffmpeg_path': installed_path,
            })

        except Exception as e:
            self._send_progress({
                'status': 'error',
                'message': f"FFmpeg download failed: {str(e)}"
            })

    def _download_worker(self, url, download_dir, format_id):
        """Worker thread that executes the yt-dlp download."""
        try:
            self._send_progress({'status': 'starting', 'message': 'Initializing extraction...'})

            is_audio_only = format_id == 'bestaudio/best'

            ydl_opts = {
                'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
                'progress_hooks': [self._progress_hook],
                'postprocessor_hooks': [self._postprocessor_hook],
                'noprogress': True,
                'quiet': True,
                'no_warnings': True,
            }

            # Find ffmpeg: settings exe → system PATH → default bin → custom session dir
            ffmpeg_dir = None
            ffmpeg_name = self._get_ffmpeg_name()
            if self._custom_ffmpeg_exe and os.path.exists(self._custom_ffmpeg_exe):
                ffmpeg_dir = os.path.dirname(self._custom_ffmpeg_exe)
            elif not shutil.which('ffmpeg'):
                for candidate in [self._get_bin_dir(), self._custom_ffmpeg_dir]:
                    if candidate and os.path.exists(os.path.join(candidate, ffmpeg_name)):
                        ffmpeg_dir = candidate
                        break
            if ffmpeg_dir:
                ydl_opts['ffmpeg_location'] = ffmpeg_dir

            if is_audio_only:
                ydl_opts['format'] = 'bestaudio/best'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]
            else:
                ydl_opts['format'] = format_id
                ydl_opts['merge_output_format'] = 'mp4'

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            self._send_progress({'status': 'completed', 'percent': 100, 'message': 'Archival complete!'})
        except Exception as e:
            self._send_progress({'status': 'error', 'message': str(e)})

    def _progress_hook(self, d):
        if d['status'] == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            percent = (downloaded / total * 100) if total > 0 else 0

            speed = d.get('speed', 0)
            if speed:
                speed_str = (f"{speed / (1024 * 1024):.1f} MB/s"
                             if speed > 1024 * 1024
                             else f"{speed / 1024:.1f} KB/s")
            else:
                speed_str = 'N/A'

            self._send_progress({
                'status': 'downloading',
                'percent': percent,
                'speed': speed_str,
                'eta': d.get('_eta_str', 'N/A'),
                'downloaded': d.get('_downloaded_bytes_str', 'N/A'),
                'total': d.get('_total_bytes_str', 'N/A'),
                'filename': os.path.basename(d.get('filename', ''))
            })

        elif d['status'] == 'finished':
            self._send_progress({
                'status': 'merging',
                'percent': 100,
                'message': 'Merging components and compiling stream...'
            })

    def _postprocessor_hook(self, d):
        if d['status'] == 'started':
            self._send_progress({
                'status': 'processing',
                'percent': 100,
                'message': f"Post-processor: {d['postprocessor']}..."
            })
        elif d['status'] == 'finished':
            self._send_progress({
                'status': 'processing_done',
                'percent': 100,
                'message': "Component processing complete."
            })

    def _send_progress(self, data):
        """Sends data back to the React UI."""
        if self._window:
            serialized = json.dumps(data)
            self._window.evaluate_js(f"if (window.onDownloadProgress) window.onDownloadProgress({serialized});")

def _write_crash_log(text):
    log_path = os.path.join(os.path.expanduser('~'), 'kinescope_crash.log')
    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(text + '\n')

def main():
    import traceback
    try:
        _start()
    except Exception:
        _write_crash_log(traceback.format_exc())
        raise

def _start():
    if getattr(sys, 'frozen', False):
        base_dir = sys._MEIPASS
    else:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    frontend_dist = os.path.join(base_dir, 'frontend', 'dist', 'index.html')

    api = Api()
    dev_mode = os.environ.get('KINESCOPE_DEV', '0') == '1'
    url = 'http://localhost:5173' if dev_mode else frontend_dist

    if not dev_mode and not os.path.exists(frontend_dist):
        _write_crash_log(f"Frontend not found at: {frontend_dist}")
        sys.exit(1)

    window = webview.create_window(
        title='KINESCOPE // ARCHIVAL DECK',
        url=url,
        js_api=api,
        width=580,
        height=680,
        resizable=False,
        background_color='#0c0e12'
    )

    api._window = window
    
    # On macOS, pywebview defaults to WebKit which does not need edgechromium.
    # On Windows, we explicitly force edgechromium to avoid MSHTML lockups.
    gui_engine = 'edgechromium' if sys.platform == 'win32' else None
    webview.start(debug=dev_mode, gui=gui_engine)

if __name__ == '__main__':
    main()
