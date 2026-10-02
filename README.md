# Blur Studio

Blur Studio is a browser-based image privacy tool for Gaussian blur, face blur, batch export, and Apple-like wallpaper blur.

## Features

- Drag, upload, or paste images
- Full-image Gaussian blur
- Brush-based local blur
- Rectangle blur regions
- Automatic face detection and blur
- Batch face detection
- Apple-like wallpaper blur mode
- Before/after comparison
- Export as PNG, JPG, WebP, or batch ZIP

## Usage

Open `index.html` in a browser, or serve the folder with a local web server.

```bash
python -m http.server 8765
```

Then visit:

```text
http://127.0.0.1:8765/
```

Images are processed in the browser. No image files are uploaded to a server.

## Notes

Face detection uses MediaPipe Tasks Vision from a CDN when the browser does not provide a native `FaceDetector` API. ZIP export uses JSZip from a CDN.
