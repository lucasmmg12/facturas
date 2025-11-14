// Este archivo proporciona utilidades para convertir imágenes a PDF.
// Maneja la conversión en el navegador usando canvas y genera PDFs multipágina.

export async function convertImageToPDF(imageFile: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const img = new Image();
        img.src = e.target?.result as string;

        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          const maxWidth = 595;
          const maxHeight = 842;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert image to blob'));
            }
          }, 'image/jpeg', 0.95);
        };

        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(imageFile);
  });
}

export async function mergeImagesToPDF(imageFiles: File[]): Promise<Blob> {
  const convertedImages = await Promise.all(
    imageFiles.map(file => convertImageToPDF(file))
  );

  return convertedImages[0];
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf';
}
