const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  fileInput: $("#fileInput"),
  uploadBtn: $("#uploadBtn"),
  pasteBtn: $("#pasteBtn"),
  dropZone: $("#dropZone"),
  canvasWrap: $("#canvasWrap"),
  canvas: $("#editorCanvas"),
  imageList: $("#imageList"),
  imageCount: $("#imageCount"),
  imageMeta: $("#imageMeta"),
  workStatus: $("#workStatus"),
  globalBlur: $("#globalBlur"),
  globalBlurValue: $("#globalBlurValue"),
  localBlur: $("#localBlur"),
  localBlurValue: $("#localBlurValue"),
  brushSize: $("#brushSize"),
  brushSizeValue: $("#brushSizeValue"),
  wallpaperToggle: $("#wallpaperToggle"),
  wallpaperStrength: $("#wallpaperStrength"),
  wallpaperStrengthValue: $("#wallpaperStrengthValue"),
  facePadding: $("#facePadding"),
  facePaddingValue: $("#facePaddingValue"),
  faceList: $("#faceList"),
  compareToggle: $("#compareToggle"),
  compareRange: $("#compareRange"),
  compareValue: $("#compareValue"),
  exportFormat: $("#exportFormat"),
  qualityRange: $("#qualityRange"),
  qualityValue: $("#qualityValue"),
  exportSize: $("#exportSize"),
  exportCurrentBtn: $("#exportCurrentBtn"),
  exportZipBtn: $("#exportZipBtn"),
  detectFacesBtn: $("#detectFacesBtn"),
  detectAllBtn: $("#detectAllBtn"),
  applyBlurAllBtn: $("#applyBlurAllBtn"),
  undoBtn: $("#undoBtn"),
  clearLocalBtn: $("#clearLocalBtn"),
  removeImageBtn: $("#removeImageBtn"),
  toastRegion: $("#toastRegion"),
};

const state = {
  items: [],
  activeId: null,
  mode: "brush",
  drawing: false,
  currentStroke: null,
  rectStart: null,
  previewRect: null,
  faceDetectorPromise: null,
  wallpaperNoise: null,
  settings: {
    localBlur: 24,
    brushSize: 56,
    wallpaperMode: false,
    wallpaperStrength: 72,
    facePadding: 0.28,
    compare: false,
    compareRatio: 0.5,
    exportFormat: "image/png",
    exportQuality: 0.92,
    exportSize: "original",
  },
};

const ctx = els.canvas.getContext("2d", { willReadFrequently: false });

init();

function init() {
  bindEvents();
  syncOutputs();
  renderImageList();
  render();
  refreshIcons();
}

function bindEvents() {
  els.uploadBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", (event) => {
    handleFiles(event.target.files);
    event.target.value = "";
  });

  els.dropZone.addEventListener("click", () => els.fileInput.click());
  els.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.dropZone.classList.add("drag-over");
  });
  els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("drag-over"));
  els.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("drag-over");
    handleFiles(event.dataTransfer.files);
  });

  document.addEventListener("paste", (event) => {
    const files = [...event.clipboardData?.files || []].filter((file) => file.type.startsWith("image/"));
    if (files.length) handleFiles(files);
  });

  els.pasteBtn.addEventListener("click", pasteFromClipboard);

  $$(".tool-button[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  els.globalBlur.addEventListener("input", () => {
    const item = getActiveItem();
    if (!item) return;
    item.globalBlur = Number(els.globalBlur.value);
    syncOutputs();
    render();
    renderImageList();
  });

  els.localBlur.addEventListener("input", () => {
    state.settings.localBlur = Number(els.localBlur.value);
    syncOutputs();
    render();
  });

  els.brushSize.addEventListener("input", () => {
    state.settings.brushSize = Number(els.brushSize.value);
    syncOutputs();
    render();
  });

  els.wallpaperToggle.addEventListener("change", () => {
    state.settings.wallpaperMode = els.wallpaperToggle.checked;
    render();
    renderImageList();
  });

  els.wallpaperStrength.addEventListener("input", () => {
    state.settings.wallpaperStrength = Number(els.wallpaperStrength.value);
    syncOutputs();
    render();
  });

  els.facePadding.addEventListener("input", () => {
    state.settings.facePadding = Number(els.facePadding.value) / 100;
    syncOutputs();
    render();
  });

  els.compareToggle.addEventListener("change", () => {
    state.settings.compare = els.compareToggle.checked;
    render();
  });

  els.compareRange.addEventListener("input", () => {
    state.settings.compareRatio = Number(els.compareRange.value) / 100;
    syncOutputs();
    render();
  });

  els.exportFormat.addEventListener("change", () => {
    state.settings.exportFormat = els.exportFormat.value;
  });

  els.qualityRange.addEventListener("input", () => {
    state.settings.exportQuality = Number(els.qualityRange.value) / 100;
    syncOutputs();
  });

  els.exportSize.addEventListener("change", () => {
    state.settings.exportSize = els.exportSize.value;
  });

  els.canvas.addEventListener("pointerdown", onPointerDown);
  els.canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  els.detectFacesBtn.addEventListener("click", () => {
    const item = getActiveItem();
    if (item) detectFacesForItem(item, true);
  });

  els.detectAllBtn.addEventListener("click", detectFacesForAll);
  els.applyBlurAllBtn.addEventListener("click", applyGlobalBlurToAll);
  els.exportCurrentBtn.addEventListener("click", exportCurrent);
  els.exportZipBtn.addEventListener("click", exportZip);
  els.undoBtn.addEventListener("click", undoActive);
  els.clearLocalBtn.addEventListener("click", clearLocalActive);
  els.removeImageBtn.addEventListener("click", removeActiveImage);
}

async function handleFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));
  if (!files.length) {
    toast("没有发现可用图片。");
    return;
  }

  setStatus(`正在导入 ${files.length} 张图片...`);
  const loaded = [];
  for (const file of files) {
    try {
      loaded.push(await createImageItem(file));
    } catch (error) {
      console.error(error);
      toast(`${file.name} 导入失败。`);
    }
  }

  state.items.push(...loaded);
  if (!state.activeId && loaded[0]) {
    state.activeId = loaded[0].id;
    loadActiveControls();
  }

  renderImageList();
  render();
  setStatus(`已导入 ${loaded.length} 张图片`);
}

function createImageItem(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        id: crypto.randomUUID(),
        file,
        name: file.name || "pasted-image.png",
        url,
        img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        globalBlur: Number(els.globalBlur.value),
        rects: [],
        strokes: [],
        faces: [],
        blurCache: new Map(),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

async function pasteFromClipboard() {
  if (!navigator.clipboard?.read) {
    toast("当前浏览器不支持按钮读取剪贴板，可直接按 Ctrl+V。");
    return;
  }

  try {
    const items = await navigator.clipboard.read();
    const files = [];
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        files.push(new File([blob], `clipboard-${Date.now()}.png`, { type: imageType }));
      }
    }
    if (files.length) {
      handleFiles(files);
    } else {
      toast("剪贴板里没有图片。");
    }
  } catch (error) {
    console.warn(error);
    toast("读取剪贴板失败，可直接按 Ctrl+V。");
  }
}

function setMode(mode) {
  state.mode = mode;
  $$(".tool-button[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  render();
}

function getActiveItem() {
  return state.items.find((item) => item.id === state.activeId) || null;
}

function setActiveItem(id) {
  state.activeId = id;
  state.previewRect = null;
  state.currentStroke = null;
  state.drawing = false;
  loadActiveControls();
  renderImageList();
  render();
}

function loadActiveControls() {
  const item = getActiveItem();
  els.globalBlur.value = item?.globalBlur ?? 0;
  syncOutputs();
}

function syncOutputs() {
  els.globalBlurValue.value = `${Number(els.globalBlur.value)}px`;
  els.localBlurValue.value = `${state.settings.localBlur}px`;
  els.brushSizeValue.value = `${state.settings.brushSize}px`;
  els.wallpaperStrengthValue.value = `${state.settings.wallpaperStrength}%`;
  els.facePaddingValue.value = `${Math.round(state.settings.facePadding * 100)}%`;
  els.compareValue.value = `${Math.round(state.settings.compareRatio * 100)}%`;
  els.qualityValue.value = `${Math.round(state.settings.exportQuality * 100)}%`;
}

function renderImageList() {
  els.imageCount.textContent = String(state.items.length);
  if (!state.items.length) {
    els.imageList.innerHTML = `<div class="muted-line">暂无图片</div>`;
    refreshIcons();
    return;
  }

  els.imageList.innerHTML = state.items
    .map((item) => {
      const localCount = item.rects.length + item.strokes.length + item.faces.filter((face) => face.enabled).length;
      return `
        <div class="image-item ${item.id === state.activeId ? "active" : ""}" data-id="${item.id}" role="button" tabindex="0">
          <img class="thumb" src="${item.url}" alt="" />
          <div class="image-info">
            <div class="image-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="image-tags">
              <span class="tag">${item.width}x${item.height}</span>
              <span class="tag">${item.globalBlur}px</span>
              <span class="tag">${localCount} 区域</span>
              ${state.settings.wallpaperMode ? `<span class="tag accent">壁纸</span>` : ""}
            </div>
          </div>
          <button class="remove-small" data-remove="${item.id}" type="button" title="移除">
            <i data-lucide="x"></i>
          </button>
        </div>
      `;
    })
    .join("");

  $$(".image-item").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("[data-remove]")) return;
      setActiveItem(node.dataset.id);
    });
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") setActiveItem(node.dataset.id);
    });
  });

  $$("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeImage(button.dataset.remove));
  });

  refreshIcons();
}

function renderFaceList() {
  const item = getActiveItem();
  if (!item || !item.faces.length) {
    els.faceList.innerHTML = `<div class="muted-line">暂无人脸区域</div>`;
    return;
  }

  els.faceList.innerHTML = item.faces
    .map((face, index) => `
      <div class="face-row">
        <input type="checkbox" data-face-toggle="${index}" ${face.enabled ? "checked" : ""} aria-label="启用人脸 ${index + 1}" />
        <span>人脸 ${index + 1}${face.score ? ` · ${Math.round(face.score * 100)}%` : ""}</span>
        <button type="button" data-face-remove="${index}" title="删除">
          <i data-lucide="x"></i>
        </button>
      </div>
    `)
    .join("");

  $$("[data-face-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const active = getActiveItem();
      if (!active) return;
      active.faces[Number(input.dataset.faceToggle)].enabled = input.checked;
      render();
      renderImageList();
    });
  });

  $$("[data-face-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const active = getActiveItem();
      if (!active) return;
      active.faces.splice(Number(button.dataset.faceRemove), 1);
      renderFaceList();
      renderImageList();
      render();
    });
  });

  refreshIcons();
}

function render() {
  const item = getActiveItem();
  if (!item) {
    els.canvasWrap.classList.remove("has-image");
    els.imageMeta.textContent = "未选择图片";
    renderFaceList();
    return;
  }

  els.canvasWrap.classList.add("has-image");
  els.canvas.width = item.width;
  els.canvas.height = item.height;
  sizeCanvasForViewport(item);
  drawProcessedImage(item, els.canvas, {
    compare: state.settings.compare,
    guides: true,
  });
  els.imageMeta.textContent = `${item.name} · ${item.width} x ${item.height}`;
  renderFaceList();
}

function sizeCanvasForViewport(item) {
  const wrapRect = els.canvasWrap.getBoundingClientRect();
  const maxWidth = Math.max(260, wrapRect.width - 38);
  const maxHeight = Math.max(240, wrapRect.height - 38);
  const ratio = Math.min(maxWidth / item.width, maxHeight / item.height, 1);
  els.canvas.style.width = `${Math.round(item.width * ratio)}px`;
  els.canvas.style.height = `${Math.round(item.height * ratio)}px`;
}

function drawProcessedImage(item, targetCanvas, options = {}) {
  const {
    compare = false,
    guides = false,
    scale = 1,
  } = options;
  const targetCtx = targetCanvas.getContext("2d");
  const width = item.width;
  const height = item.height;

  targetCtx.setTransform(scale, 0, 0, scale, 0, 0);
  targetCtx.clearRect(0, 0, width, height);

  drawBaseLayer(item, targetCtx, width, height);

  drawRects(item, targetCtx);
  drawStrokes(item, targetCtx);
  drawFaces(item, targetCtx);

  if (compare) {
    const splitX = width * state.settings.compareRatio;
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(0, 0, splitX, height);
    targetCtx.clip();
    targetCtx.drawImage(item.img, 0, 0, width, height);
    targetCtx.restore();

    targetCtx.save();
    targetCtx.strokeStyle = "#ffffff";
    targetCtx.lineWidth = Math.max(2, width / 800);
    targetCtx.shadowColor = "rgba(0,0,0,0.35)";
    targetCtx.shadowBlur = 6;
    targetCtx.beginPath();
    targetCtx.moveTo(splitX, 0);
    targetCtx.lineTo(splitX, height);
    targetCtx.stroke();
    targetCtx.restore();
  }

  if (guides) {
    drawGuides(item, targetCtx);
  }

  targetCtx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawBaseLayer(item, targetCtx, width, height) {
  if (state.settings.wallpaperMode) {
    drawAppleWallpaperLayer(item, targetCtx, width, height);
    return;
  }

  if (item.globalBlur > 0) {
    targetCtx.save();
    targetCtx.filter = `blur(${item.globalBlur}px)`;
    targetCtx.drawImage(item.img, 0, 0, width, height);
    targetCtx.restore();
    return;
  }

  targetCtx.drawImage(item.img, 0, 0, width, height);
}

function drawAppleWallpaperLayer(item, targetCtx, width, height) {
  const strength = state.settings.wallpaperStrength / 100;
  const blur = wallpaperBlurRadius(item);
  const expand = Math.ceil(blur * 2.4);
  const saturation = (1.06 + strength * 0.16).toFixed(2);
  const brightness = (1.02 + strength * 0.07).toFixed(2);
  const contrast = (1.02 - strength * 0.08).toFixed(2);

  targetCtx.save();
  targetCtx.filter = `blur(${blur}px) saturate(${saturation}) brightness(${brightness}) contrast(${contrast})`;
  targetCtx.drawImage(item.img, -expand, -expand, width + expand * 2, height + expand * 2);
  targetCtx.restore();

  const wash = targetCtx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, `rgba(255,255,255,${0.05 + strength * 0.08})`);
  wash.addColorStop(0.48, `rgba(255,255,255,${0.015 + strength * 0.025})`);
  wash.addColorStop(1, `rgba(0,0,0,${0.05 + strength * 0.09})`);
  targetCtx.fillStyle = wash;
  targetCtx.fillRect(0, 0, width, height);

  const vignette = targetCtx.createRadialGradient(
    width * 0.5,
    height * 0.44,
    Math.min(width, height) * 0.08,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.78
  );
  vignette.addColorStop(0, `rgba(255,255,255,${0.035 + strength * 0.035})`);
  vignette.addColorStop(0.62, "rgba(255,255,255,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${0.06 + strength * 0.08})`);
  targetCtx.fillStyle = vignette;
  targetCtx.fillRect(0, 0, width, height);

  drawWallpaperGrain(targetCtx, width, height, strength);
}

function wallpaperBlurRadius(item) {
  const shortest = Math.min(item.width, item.height);
  const strength = state.settings.wallpaperStrength / 100;
  return Math.round(clamp(shortest * (0.022 + strength * 0.031), 18, 128));
}

function drawWallpaperGrain(targetCtx, width, height, strength) {
  const pattern = getWallpaperNoisePattern(targetCtx);
  if (!pattern) return;

  targetCtx.save();
  targetCtx.globalAlpha = 0.018 + strength * 0.018;
  targetCtx.globalCompositeOperation = "soft-light";
  targetCtx.fillStyle = pattern;
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.restore();
}

function getWallpaperNoisePattern(targetCtx) {
  if (!state.wallpaperNoise) {
    const noise = document.createElement("canvas");
    noise.width = 96;
    noise.height = 96;
    const noiseCtx = noise.getContext("2d");
    const imageData = noiseCtx.createImageData(noise.width, noise.height);

    for (let i = 0; i < imageData.data.length; i += 4) {
      const value = 118 + Math.floor(Math.random() * 36);
      imageData.data[i] = value;
      imageData.data[i + 1] = value;
      imageData.data[i + 2] = value;
      imageData.data[i + 3] = 46;
    }

    noiseCtx.putImageData(imageData, 0, 0);
    state.wallpaperNoise = noise;
  }

  return targetCtx.createPattern(state.wallpaperNoise, "repeat");
}

function drawRects(item, targetCtx) {
  if (!item.rects.length) return;
  const blurred = getBlurredCanvas(item, localBlurForItem(item));
  item.rects.forEach((rect) => {
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(rect.x, rect.y, rect.w, rect.h);
    targetCtx.clip();
    targetCtx.drawImage(blurred, 0, 0);
    targetCtx.restore();
  });
}

function drawStrokes(item, targetCtx) {
  const strokes = [...item.strokes];
  if (state.currentStroke) strokes.push(state.currentStroke);
  if (!strokes.length) return;

  const blurred = getBlurredCanvas(item, localBlurForItem(item));
  strokes.forEach((stroke) => {
    targetCtx.save();
    targetCtx.beginPath();
    stroke.points.forEach((point) => {
      targetCtx.moveTo(point.x + stroke.radius, point.y);
      targetCtx.arc(point.x, point.y, stroke.radius, 0, Math.PI * 2);
    });
    targetCtx.clip();
    targetCtx.drawImage(blurred, 0, 0);
    targetCtx.restore();
  });
}

function drawFaces(item, targetCtx) {
  const faces = item.faces.filter((face) => face.enabled);
  if (!faces.length) return;

  const blurred = getBlurredCanvas(item, localBlurForItem(item));
  faces.forEach((face) => {
    const rect = expandRect(face, item, state.settings.facePadding);
    targetCtx.save();
    roundedPath(targetCtx, rect.x, rect.y, rect.w, rect.h, Math.min(rect.w, rect.h) * 0.18);
    targetCtx.clip();
    targetCtx.drawImage(blurred, 0, 0);
    targetCtx.restore();
  });
}

function localBlurForItem(item) {
  if (!state.settings.wallpaperMode) return state.settings.localBlur;
  return Math.max(state.settings.localBlur, wallpaperBlurRadius(item) + 12);
}

function drawGuides(item, targetCtx) {
  const lineWidth = Math.max(2, item.width / 900);

  if (state.mode === "face" && item.faces.length) {
    targetCtx.save();
    targetCtx.lineWidth = lineWidth;
    targetCtx.strokeStyle = "#d69221";
    targetCtx.setLineDash([lineWidth * 4, lineWidth * 3]);
    item.faces.forEach((face) => {
      const rect = expandRect(face, item, state.settings.facePadding);
      roundedPath(targetCtx, rect.x, rect.y, rect.w, rect.h, Math.min(rect.w, rect.h) * 0.18);
      targetCtx.stroke();
    });
    targetCtx.restore();
  }

  if (state.previewRect) {
    targetCtx.save();
    targetCtx.fillStyle = "rgba(214, 146, 33, 0.12)";
    targetCtx.strokeStyle = "#d69221";
    targetCtx.lineWidth = lineWidth;
    targetCtx.setLineDash([lineWidth * 5, lineWidth * 3]);
    targetCtx.fillRect(state.previewRect.x, state.previewRect.y, state.previewRect.w, state.previewRect.h);
    targetCtx.strokeRect(state.previewRect.x, state.previewRect.y, state.previewRect.w, state.previewRect.h);
    targetCtx.restore();
  }
}

function getBlurredCanvas(item, blur) {
  const key = String(blur);
  if (item.blurCache.has(key)) return item.blurCache.get(key);

  const offscreen = document.createElement("canvas");
  offscreen.width = item.width;
  offscreen.height = item.height;
  const offCtx = offscreen.getContext("2d");
  offCtx.filter = `blur(${blur}px)`;
  offCtx.drawImage(item.img, 0, 0, item.width, item.height);
  offCtx.filter = "none";
  item.blurCache.set(key, offscreen);

  if (item.blurCache.size > 8) {
    const firstKey = item.blurCache.keys().next().value;
    item.blurCache.delete(firstKey);
  }
  return offscreen;
}

function roundedPath(targetCtx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  targetCtx.beginPath();
  targetCtx.moveTo(x + r, y);
  targetCtx.lineTo(x + w - r, y);
  targetCtx.quadraticCurveTo(x + w, y, x + w, y + r);
  targetCtx.lineTo(x + w, y + h - r);
  targetCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  targetCtx.lineTo(x + r, y + h);
  targetCtx.quadraticCurveTo(x, y + h, x, y + h - r);
  targetCtx.lineTo(x, y + r);
  targetCtx.quadraticCurveTo(x, y, x + r, y);
  targetCtx.closePath();
}

function onPointerDown(event) {
  const item = getActiveItem();
  if (!item || state.mode === "inspect" || state.mode === "face") return;
  event.preventDefault();
  els.canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  state.drawing = true;

  if (state.mode === "brush") {
    state.currentStroke = {
      radius: state.settings.brushSize / 2,
      points: [point],
    };
  }

  if (state.mode === "rect") {
    state.rectStart = point;
    state.previewRect = { x: point.x, y: point.y, w: 0, h: 0 };
  }
}

function onPointerMove(event) {
  const item = getActiveItem();
  if (!item || !state.drawing) return;
  const point = canvasPoint(event);

  if (state.mode === "brush" && state.currentStroke) {
    addInterpolatedPoints(state.currentStroke, point);
    render();
  }

  if (state.mode === "rect" && state.rectStart) {
    state.previewRect = normalizeRect(state.rectStart, point, item);
    render();
  }
}

function onPointerUp() {
  if (!state.drawing) return;
  const item = getActiveItem();
  if (!item) return;

  if (state.mode === "brush" && state.currentStroke) {
    item.strokes.push(state.currentStroke);
    state.currentStroke = null;
  }

  if (state.mode === "rect" && state.previewRect) {
    if (Math.abs(state.previewRect.w) > 8 && Math.abs(state.previewRect.h) > 8) {
      item.rects.push(state.previewRect);
    }
    state.previewRect = null;
    state.rectStart = null;
  }

  state.drawing = false;
  renderImageList();
  render();
}

function canvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  const item = getActiveItem();
  const x = ((event.clientX - rect.left) / rect.width) * item.width;
  const y = ((event.clientY - rect.top) / rect.height) * item.height;
  return {
    x: clamp(x, 0, item.width),
    y: clamp(y, 0, item.height),
  };
}

function addInterpolatedPoints(stroke, point) {
  const last = stroke.points[stroke.points.length - 1];
  const dx = point.x - last.x;
  const dy = point.y - last.y;
  const distance = Math.hypot(dx, dy);
  const spacing = Math.max(4, stroke.radius * 0.35);
  const steps = Math.max(1, Math.floor(distance / spacing));
  for (let i = 1; i <= steps; i += 1) {
    stroke.points.push({
      x: last.x + (dx * i) / steps,
      y: last.y + (dy * i) / steps,
    });
  }
}

function normalizeRect(start, end, item) {
  const x1 = clamp(Math.min(start.x, end.x), 0, item.width);
  const y1 = clamp(Math.min(start.y, end.y), 0, item.height);
  const x2 = clamp(Math.max(start.x, end.x), 0, item.width);
  const y2 = clamp(Math.max(start.y, end.y), 0, item.height);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

async function detectFacesForAll() {
  if (!state.items.length) {
    toast("请先导入图片。");
    return;
  }

  for (let i = 0; i < state.items.length; i += 1) {
    setStatus(`检测人脸 ${i + 1}/${state.items.length}...`);
    await detectFacesForItem(state.items[i], false);
  }
  setStatus("批量人脸检测完成");
  toast("批量人脸检测完成。");
}

async function detectFacesForItem(item, announce = true) {
  try {
    setStatus("正在加载人脸检测...");
    const detector = await getFaceDetector();
    setStatus("正在检测人脸...");
    const faces = await runFaceDetection(detector, item);
    item.faces = faces.map((face) => ({
      ...face,
      enabled: true,
    }));
    renderImageList();
    if (item.id === state.activeId) render();
    setStatus(`检测到 ${faces.length} 张人脸`);
    if (announce) toast(faces.length ? `检测到 ${faces.length} 张人脸。` : "没有检测到人脸。");
  } catch (error) {
    console.error(error);
    setStatus("人脸检测不可用");
    toast("人脸检测加载失败，可用矩形工具手动框选。");
  }
}

async function getFaceDetector() {
  if (!state.faceDetectorPromise) {
    state.faceDetectorPromise = createFaceDetector();
  }
  return state.faceDetectorPromise;
}

async function createFaceDetector() {
  if ("FaceDetector" in window) {
    return {
      type: "native",
      detector: new window.FaceDetector({ fastMode: true, maxDetectedFaces: 100 }),
    };
  }

  const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/+esm");
  const fileset = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
  );
  const detector = await vision.FaceDetector.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
      delegate: "CPU",
    },
    runningMode: "IMAGE",
  });

  return { type: "mediapipe", detector };
}

async function runFaceDetection(faceDetector, item) {
  if (faceDetector.type === "native") {
    const detections = await faceDetector.detector.detect(item.img);
    return detections.map((detection) => {
      const box = detection.boundingBox;
      return {
        x: box.x ?? box.left,
        y: box.y ?? box.top,
        w: box.width,
        h: box.height,
        score: 0,
      };
    });
  }

  const result = faceDetector.detector.detect(item.img);
  return (result.detections || []).map((detection) => {
    const box = detection.boundingBox;
    return {
      x: box.originX,
      y: box.originY,
      w: box.width,
      h: box.height,
      score: detection.categories?.[0]?.score || 0,
    };
  });
}

function expandRect(face, item, paddingRatio) {
  const pad = Math.max(face.w, face.h) * paddingRatio;
  const x = clamp(face.x - pad, 0, item.width);
  const y = clamp(face.y - pad, 0, item.height);
  const right = clamp(face.x + face.w + pad, 0, item.width);
  const bottom = clamp(face.y + face.h + pad, 0, item.height);
  return { x, y, w: right - x, h: bottom - y };
}

function applyGlobalBlurToAll() {
  const item = getActiveItem();
  if (!item || !state.items.length) {
    toast("请先选择一张图片。");
    return;
  }
  state.items.forEach((target) => {
    target.globalBlur = item.globalBlur;
  });
  renderImageList();
  render();
  toast("已同步全图模糊强度。");
}

function undoActive() {
  const item = getActiveItem();
  if (!item) return;

  if (item.strokes.length) {
    item.strokes.pop();
  } else if (item.rects.length) {
    item.rects.pop();
  } else if (item.faces.length) {
    item.faces.pop();
  } else if (item.globalBlur > 0) {
    item.globalBlur = 0;
    els.globalBlur.value = 0;
    syncOutputs();
  }

  renderImageList();
  render();
}

function clearLocalActive() {
  const item = getActiveItem();
  if (!item) return;
  item.rects = [];
  item.strokes = [];
  item.faces = [];
  renderImageList();
  render();
  toast("已清除当前图片的局部模糊。");
}

function removeActiveImage() {
  const item = getActiveItem();
  if (item) removeImage(item.id);
}

function removeImage(id) {
  const index = state.items.findIndex((item) => item.id === id);
  if (index < 0) return;
  URL.revokeObjectURL(state.items[index].url);
  state.items.splice(index, 1);
  if (state.activeId === id) {
    state.activeId = state.items[index]?.id || state.items[index - 1]?.id || null;
    loadActiveControls();
  }
  renderImageList();
  render();
}

async function exportCurrent() {
  const item = getActiveItem();
  if (!item) {
    toast("请先导入图片。");
    return;
  }
  setStatus("正在导出当前图片...");
  const blob = await renderItemToBlob(item);
  downloadBlob(blob, outputName(item.name, state.settings.exportFormat));
  setStatus("当前图片已导出");
}

async function exportZip() {
  if (!state.items.length) {
    toast("请先导入图片。");
    return;
  }

  try {
    const ZipClass = await ensureZip();
    const zip = new ZipClass();
    for (let i = 0; i < state.items.length; i += 1) {
      const item = state.items[i];
      setStatus(`正在打包 ${i + 1}/${state.items.length}...`);
      const blob = await renderItemToBlob(item);
      zip.file(outputName(item.name, state.settings.exportFormat), blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, `blur-studio-${timestamp()}.zip`);
    setStatus("ZIP 已导出");
  } catch (error) {
    console.error(error);
    setStatus("ZIP 导出失败");
    toast("ZIP 组件加载失败，可先导出当前图片。");
  }
}

async function ensureZip() {
  if (window.JSZip) return window.JSZip;
  const imported = await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  return imported.default || imported;
}

async function renderItemToBlob(item) {
  const { width, height, scale } = exportDimensions(item);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  drawProcessedImage(item, out, {
    compare: false,
    guides: false,
    scale,
  });

  const mime = state.settings.exportFormat;
  const quality = mime === "image/png" ? undefined : state.settings.exportQuality;
  return canvasToBlob(out, mime, quality);
}

function exportDimensions(item) {
  let scale = 1;
  if (state.settings.exportSize === "half") {
    scale = 0.5;
  }
  if (state.settings.exportSize === "max1600") {
    scale = Math.min(1, 1600 / Math.max(item.width, item.height));
  }
  return {
    width: Math.max(1, Math.round(item.width * scale)),
    height: Math.max(1, Math.round(item.height * scale)),
    scale,
  };
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        canvas.toBlob(resolve, "image/png");
      }
    }, mime, quality);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function outputName(name, mime) {
  const ext = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }[mime] || "png";
  const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-") || "image";
  return `${base}_blur.${ext}`;
}

function setStatus(text) {
  els.workStatus.textContent = text;
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  els.toastRegion.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(4px)";
  }, 2600);
  setTimeout(() => node.remove(), 3100);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

window.addEventListener("resize", () => render());
