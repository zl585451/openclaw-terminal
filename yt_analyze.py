"""Fetch YouTube video captions - try OAuth API first, fallback to yt-dlp."""
import json, os, sys, urllib.request, urllib.error, subprocess, tempfile

VIDEO_ID = '5-ljiJsT9Yo'
URL = f'https://www.youtube.com/watch?v={VIDEO_ID}'
CONFIG = os.path.join(os.path.expanduser('~'), '.youtube_oauth', 'config.json')
OUT_DIR = os.path.join(os.path.expanduser('~'), '.youtube_oauth')

with open(CONFIG) as f:
    cfg = json.load(f)

api_key = cfg['youtube_api_key']
access_token = cfg['oauth_tokens']['access_token']

# Step 1: Get video metadata
print('=== Video Info ===')
url = f'https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id={VIDEO_ID}&key={api_key}'
resp = urllib.request.urlopen(urllib.request.Request(url), timeout=10)
data = json.loads(resp.read())
item = data['items'][0]
snippet = item['snippet']
content = item['contentDetails']
print(f"Title: {snippet['title']}")
print(f"Channel: {snippet['channelTitle']}")
print(f"Duration: {content['duration']}")
print(f"Caption available: {content['caption']}")
print(f"Description: {snippet.get('description','')[:500]}")

# Step 2: Try OAuth caption download with tfmt parameter
print('\n=== Captions ===')
list_url = f'https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId={VIDEO_ID}'
req = urllib.request.Request(list_url)
req.add_header('Authorization', f'Bearer {access_token}')
resp2 = urllib.request.urlopen(req, timeout=10)
items = json.loads(resp2.read()).get('items', [])

if items:
    for t in items:
        s = t['snippet']
        print(f"  id={t['id']} lang={s.get('language')} trackKind={s.get('trackKind')}")

    # Try download with tfmt=srt
    target = items[0]
    tid = target['id']
    for fmt in ['srt', 'sbv', 'vtt']:
        try:
            dl_url = f'https://www.googleapis.com/youtube/v3/captions/{tid}?tfmt={fmt}'
            req3 = urllib.request.Request(dl_url)
            req3.add_header('Authorization', f'Bearer {access_token}')
            resp3 = urllib.request.urlopen(req3, timeout=10)
            caption_text = resp3.read().decode('utf-8')
            print(f'\nDownloaded via API (tfmt={fmt}, {len(caption_text)} chars)')
            break
        except urllib.error.HTTPError as e:
            print(f'  tfmt={fmt}: HTTP {e.code}')
            continue
    else:
        print('All API download attempts failed, trying yt-dlp...')
        caption_text = None
else:
    print('No captions found via API, trying yt-dlp...')
    caption_text = None

# Step 3: Fallback - use yt-dlp to download subs
if not caption_text:
    print('\n--- yt-dlp fallback ---')
    with tempfile.TemporaryDirectory() as tmp:
        cmd = [
            'yt-dlp', '--skip-download', '--write-auto-subs',
            '--sub-lang', 'zh-Hans,zh,en', '--convert-subs', 'srt',
            '-o', os.path.join(tmp, '%(id)s'), URL
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        print(r.stdout[-500:] if r.stdout else '')
        if r.stderr:
            # Show last few lines of stderr
            print('stderr:', r.stderr[-200:] if r.stderr else '')

        # Look for any subtitle file
        for root, dirs, files in os.walk(tmp):
            for f in files:
                if f.endswith(('.srt', '.vtt', '.sbv')):
                    fpath = os.path.join(root, f)
                    with open(fpath, 'r', encoding='utf-8', errors='ignore') as fp:
                        caption_text = fp.read()
                    print(f'Found subtitle file: {f} ({len(caption_text)} chars)')
                    break

if caption_text:
    out_path = os.path.join(OUT_DIR, f'{VIDEO_ID}.txt')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(caption_text)
    print(f'\nSaved to: {out_path}')
    print(f'\n=== Content Preview (first 1000 chars) ===')
    print(caption_text[:1000])
else:
    print('\nFailed to get any captions.')
    print('The user needs to run yt-dlp locally where IP is not blocked.')
    print(f'Command: yt-dlp --skip-download --write-auto-subs --sub-lang zh-Hans,zh,en -o "~/Downloads/%(title)s" {URL}')
