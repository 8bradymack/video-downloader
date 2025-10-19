const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

function cleanYouTubeUrl(url) {
  let cleaned = url.split('&list=')[0];
  cleaned = cleaned.split('&index=')[0];
  return cleaned;
}

app.post('/download', (req, res) => {
  let { url, platform } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (platform === 'youtube') {
    url = cleanYouTubeUrl(url);
  }

  const timestamp = Date.now();
  const tempFile = path.join(DOWNLOADS_DIR, `temp_${timestamp}`);
  const outputFile = path.join(DOWNLOADS_DIR, `video_${timestamp}.mp4`);

  const downloadCmd = `yt-dlp -f "bestvideo+bestaudio/best" "${url}" -o "${tempFile}.%(ext)s"`;

  exec(downloadCmd, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: 'Download failed', details: stderr });
    }

    const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(`temp_${timestamp}`));
    if (files.length === 0) {
      return res.status(500).json({ error: 'Downloaded file not found' });
    }

    const downloadedFile = path.join(DOWNLOADS_DIR, files[0]);
    const convertCmd = `ffmpeg -hide_banner -loglevel error -i "${downloadedFile}" -c copy -movflags +faststart "${outputFile}"`;

    exec(convertCmd, (convertError) => {
      if (convertError) {
        const reencodeCmd = `ffmpeg -hide_banner -loglevel error -i "${downloadedFile}" -c:v libx264 -pix_fmt yuv420p -crf 20 -preset fast -c:a aac -b:a 192k -movflags +faststart "${outputFile}"`;
        
        exec(reencodeCmd, (reencodeError) => {
          if (fs.existsSync(downloadedFile)) fs.unlinkSync(downloadedFile);
          if (reencodeError) return res.status(500).json({ error: 'Conversion failed' });
          res.json({ success: true, filename: path.basename(outputFile), downloadUrl: `/download-file/${path.basename(outputFile)}` });
        });
      } else {
        if (fs.existsSync(downloadedFile)) fs.unlinkSync(downloadedFile);
        res.json({ success: true, filename: path.basename(outputFile), downloadUrl: `/download-file/${path.basename(outputFile)}` });
      }
    });
  });
});

app.get('/download-file/:filename', (req, res) => {
  const filePath = path.join(DOWNLOADS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath, (err) => {
      if (!err) {
        setTimeout(() => {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }, 1000);
      }
    });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
