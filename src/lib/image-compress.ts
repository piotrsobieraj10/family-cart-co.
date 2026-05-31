// Client-side image compression to WebP. Produces a thumbnail (~400px wide)
// and a preview (~1200px wide max), both as WebP at ~80% quality.

export interface CompressedPhoto {
  thumbnail: Blob;
  preview: Blob;
  width: number;
  height: number;
}

const THUMB_WIDTH = 400;
const PREVIEW_WIDTH = 1200;
const QUALITY = 0.8;

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Nie udało się wczytać zdjęcia"));
      img.src = url;
    });
    return img;
  } finally {
    // Revoke later so the image stays usable; tiny leak avoided by setTimeout
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function drawResized(img: HTMLImageElement, targetWidth: number): HTMLCanvasElement {
  const scale = img.naturalWidth > targetWidth ? targetWidth / img.naturalWidth : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Brak obsługi canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function canvasToWebP(canvas: HTMLCanvasElement, quality = QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Konwersja WebP nieudana"))),
      "image/webp",
      quality,
    );
  });
}

export async function compressToWebP(file: File): Promise<CompressedPhoto> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Nieprawidłowy typ pliku. Wybierz zdjęcie.");
  }
  const img = await fileToImage(file);
  const previewCanvas = drawResized(img, PREVIEW_WIDTH);
  const thumbCanvas = drawResized(img, THUMB_WIDTH);
  const [preview, thumbnail] = await Promise.all([
    canvasToWebP(previewCanvas, QUALITY),
    canvasToWebP(thumbCanvas, QUALITY),
  ]);
  return {
    thumbnail,
    preview,
    width: previewCanvas.width,
    height: previewCanvas.height,
  };
}