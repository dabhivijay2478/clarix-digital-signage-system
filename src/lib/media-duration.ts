export function normalizeMediaDurationSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('The selected media file does not expose a valid duration.');
  }
  return Math.max(1, Math.ceil(value));
}

export function formatMediaDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function detectFileMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const media = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);

    const dispose = () => {
      media.onloadedmetadata = null;
      media.onerror = null;
      media.pause();
      media.removeAttribute('src');
      URL.revokeObjectURL(objectUrl);
    };

    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      try {
        const duration = normalizeMediaDurationSeconds(media.duration);
        dispose();
        resolve(duration);
      } catch (error) {
        dispose();
        reject(error);
      }
    };
    media.onerror = () => {
      dispose();
      reject(new Error('Unable to read the video duration. Check that the file codec is supported.'));
    };
    media.src = objectUrl;
  });
}
