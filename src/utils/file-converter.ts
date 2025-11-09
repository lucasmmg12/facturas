export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export async function convertImageToPDF(imageFile: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const img = new Image();
        img.src = e.target?.result as string;

        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No se pudo obtener el contexto del canvas'));
            return;
          }

          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const pdfFileName = imageFile.name.replace(/\.(jpg|jpeg|png)$/i, '.pdf');
                const pdfFile = new File([blob], pdfFileName, { type: 'application/pdf' });
                resolve(pdfFile);
              } else {
                reject(new Error('No se pudo convertir la imagen a blob'));
              }
            },
            'image/jpeg',
            0.95
          );
        };

        img.onerror = () => {
          reject(new Error('Error al cargar la imagen'));
        };
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo'));
    };

    reader.readAsDataURL(imageFile);
  });
}
