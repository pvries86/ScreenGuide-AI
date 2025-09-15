
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

export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        if (typeof reader.result === 'string') {
            resolve(reader.result);
        } else {
            reject(new Error('Failed to read file as Data URL.'));
        }
    };
    reader.onerror = (error) => reject(error);
  });
}

export const base64ToFile = (dataUrl: string, filename: string, mimeType: string, lastModified: number): File => {
    const arr = dataUrl.split(',');
    // The `atob` function decodes a string of data which has been encoded using base-64 encoding.
    const bstr = atob(arr.length > 1 ? arr[1] : arr[0]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
  
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
  
    // If the dataUrl didn't have a prefix, we construct one.
    const fullDataUrl = dataUrl.startsWith('data:') ? dataUrl : `data:${mimeType};base64,${btoa(bstr)}`;
    
    // Create blob from the Uint8Array
    const blob = new Blob([u8arr], { type: mimeType });

    // Create file from blob
    return new File([blob], filename, { type: mimeType, lastModified });
};
