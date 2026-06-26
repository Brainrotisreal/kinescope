import sys
import os

# Add backend directory to path
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))

try:
    from main import Api
    print("[TEST] Successfully imported Api class from backend.main.")
except Exception as e:
    print(f"[TEST ERROR] Failed to import Api class: {e}")
    sys.exit(1)

def test_api():
    api = Api()
    
    # 1. Test check_dependencies
    print("[TEST] Running check_dependencies()...")
    deps = api.check_dependencies()
    print(f"[TEST RESULT] Dependencies: {deps}")
    
    # 2. Test get_default_download_dir
    print("[TEST] Running get_default_download_dir()...")
    default_dir = api.get_default_download_dir()
    print(f"[TEST RESULT] Default download dir: {default_dir}")
    
    # 3. Test get_video_info with a sample video URL (No-download mode)
    # Using a short stable video URL
    sample_url = "https://www.youtube.com/watch?v=aqz-KE-bpKQ" # Big Buck Bunny Youtube clip
    print(f"[TEST] Extracting metadata for: {sample_url}...")
    
    info = api.get_video_info(sample_url)
    if info.get('success'):
        print("[TEST RESULT] Metadata Extraction: SUCCESS!")
        print(f"Title: {info.get('title')}")
        print(f"Uploader: {info.get('uploader')}")
        print(f"Duration: {info.get('duration')}")
        print(f"Available Quality Options:")
        for fmt in info.get('formats', []):
            print(f"  - {fmt['note']} (id: {fmt['id']})")
    else:
        print(f"[TEST RESULT] Metadata Extraction: FAILED. Error: {info.get('error')}")

if __name__ == '__main__':
    test_api()
