
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
