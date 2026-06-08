"""YouTube video analyzer - saves transcript/audio transcription to a file.
Usage: python yt_video_text.py "https://www.youtube.com/watch?v=QvXWoRFYuiY"
"""
import subprocess, sys, os, tempfile, json, urllib.request, urllib.error

CONFIG = os.path.join(os.path.expanduser('~'), '.youtube_oauth', 'config.json')
OUTPUT = os.path.join(os.path.expanduser('~'), '.youtube_oauth', 'video_text.txt')

def get_caption_via_api(video_id, access_token):
    """Try to download caption via YouTube Data API with OAuth."""
    list_url = f'https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId={video_id}'
    req = urllib.request.Request(list_url)
    req.add_header('Authorization', f'Bearer {access_token}')

    try:
        resp = urllib.request.urlopen(req, timeout=10)
        items = json.loads(resp.read()).get('items', [])
        if not items:
            return None

        # Pick a track (prefer manual, then auto)
        target = items[0]
        for t in items:
            tl = t['snippet'].get('language', '')
            if tl in ('en', 'zh-Hans', 'zh') and t['snippet'].get('trackKind') != 'asr':
                target = t
                break
        for t in items:
            if t['snippet'].get('language', '') in ('en', 'zh-Hans', 'zh'):
                target = t
                break

        dl_url = f"https://www.googleapis.com/youtube/v3/captions/{target['id']}"
        req2 = urllib.request.Request(dl_url)
        req2.add_header('Authorization', f'Bearer {access_token}')
        resp2 = urllib.request.urlopen(req2, timeout=10)
        return resp2.read().decode('utf-8')
    except Exception as e:
        print(f'Caption download failed: {e}')
        return None

def get_audio_via_ytdlp(video_url):
    """Download audio and transcribe via Bailian ASR."""
    print('No captions found. Downloading audio (streaming, no disk write)...')

    audio_file = tempfile.mktemp(suffix='.wav')
    try:
        # Step 1: Download audio via yt-dlp, pipe to ffmpeg, save as wav
        cmd_dl = ['yt-dlp', '-f', 'bestaudio', '-o', '-', video_url]
        cmd_ffmpeg = ['ffmpeg', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', audio_file]

        dl = subprocess.Popen(cmd_dl, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        subprocess.run(cmd_ffmpeg, stdin=dl.stdout, check=True, timeout=120)
        dl.wait()

        if not os.path.exists(audio_file) or os.path.getsize(audio_file) < 1000:
            print('Audio download failed or file too small')
            return None

        print(f'Audio extracted ({os.path.getsize(audio_file)} bytes), transcribing...')

        # Step 2: Transcribe via Bailian
        result = subprocess.run(
            ['bl', 'speech', 'recognize', '--file', audio_file],
            capture_output=True, text=True, timeout=300
        )

        if result.returncode != 0:
            print(f'ASR stderr: {result.stderr[:500]}')
            return None

        return result.stdout.strip() or None
    finally:
        if os.path.exists(audio_file):
            os.remove(audio_file)

def main():
    if len(sys.argv) < 2:
        print('Usage: python yt_video_text.py <youtube_url>')
        sys.exit(1)

    url = sys.argv[1]
    # Extract video ID
    for sep in ('?v=', '/watch?v=', '.be/', '/shorts/'):
        if sep in url:
            vid = url.split(sep)[-1].split('&')[0].split('?')[0]
            break
    else:
        vid = url

    print(f'Video ID: {vid}')

    # Try API caption download
    text = None
    if os.path.exists(CONFIG):
        try:
            with open(CONFIG) as f:
                cfg = json.load(f)
            token = cfg.get('oauth_tokens', {}).get('access_token', '')
            if token:
                text = get_caption_via_api(vid, token)
                if text:
                    print(f'Got captions via API ({len(text)} chars)')
        except Exception as e:
            print(f'API error: {e}')

    # Fallback: download audio + ASR
    if not text:
        text = get_audio_via_ytdlp(url)

    if text:
        with open(OUTPUT, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f'\nDone! Text saved to: {OUTPUT}')
        print(f'Total: {len(text)} characters')
        print(f'\n--- Preview (first 500 chars) ---')
        print(text[:500])
    else:
        print('Failed to get any transcript.')
        sys.exit(1)

if __name__ == '__main__':
    main()
