# YouTube video transcript fetcher
# Usage: .\yt.ps1 <youtube-url>
param([string]$url)

$vid = $url -replace '.*(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([a-zA-Z0-9_-]+).*', '$1'
$out = "$env:TEMP\yt_$vid.txt"

python -c @"
import sys
sys.stdout.reconfigure(encoding='utf-8')
from youtube_transcript_api import YouTubeTranscriptApi
t = YouTubeTranscriptApi().fetch('$vid', languages=['zh-Hans','zh','en'])
text = '\n'.join([i.text for i in t])
with open(r'$out', 'w', encoding='utf-8') as f:
    f.write(text)
print(f'OK:{len(text)} chars, {len(t)} segments, saved to $out')
"@ 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED - try alternate method or video may have no captions"
}
