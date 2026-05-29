
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // remove the "data:mime/type;base64," part
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error('Failed to read file as base64 string.'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error(`Could not load image: ${file.name}`));
    };
    img.src = imageUrl;
  });
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error('Failed to read blob as base64 string.'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const prepareImageForGemini = async (
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<{ data: string; mimeType: string }> => {
  if (!file.type.startsWith('image/')) {
    return {
      data: await fileToBase64(file),
      mimeType: file.type || 'application/octet-stream',
    };
  }

  const image = await loadImage(file);
  const largestDimension = Math.max(image.width, image.height);
  const scale = Math.min(1, maxDimension / largestDimension);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      data: await fileToBase64(file),
      mimeType: file.type,
    };
  }

  ctx.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (compressedBlob) => {
        if (compressedBlob) {
          resolve(compressedBlob);
        } else {
          reject(new Error(`Could not prepare image for Gemini: ${file.name}`));
        }
      },
      'image/jpeg',
      quality
    );
  });

  return {
    data: await blobToBase64(blob),
    mimeType: 'image/jpeg',
  };
};

export const base64ToFile = (dataUrl: string, filename: string, mimeType: string, lastModified: number): File => {
  if (typeof dataUrl !== 'string') {
    throw new Error('base64ToFile expected a data URL string but received ' + typeof dataUrl);
  }
  const arr = dataUrl.split(',');
    // The `atob` function decodes a string of data which has been encoded using base-64 encoding.
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
  
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
  
    return new File([u8arr], filename, { type: mimeType, lastModified });
};
