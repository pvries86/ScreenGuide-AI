
import { InstructionStep } from '../types';

// These are globals from the scripts in index.html, so we extend the Window interface
// to inform TypeScript about them and access them via the `window` object for clarity and safety.
declare global {
  interface Window {
    jspdf: any;
    html2canvas: any;
    docx: any;
    saveAs: any;
  }
}

export const exportToPdf = async (element: HTMLElement, filename: string) => {
  if (!window.jspdf || !window.html2canvas) {
    console.error('jsPDF or html2canvas library not loaded.');
    alert('PDF export functionality is unavailable. Required libraries are missing.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const canvas = await window.html2canvas(element, {
    scale: 2,
    useCORS: true,
  });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const ratio = canvasWidth / pdfWidth;
  const imgHeight = canvasHeight / ratio;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
  heightLeft -= pdfHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;
  }

  pdf.save(`${filename}.pdf`);
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export const exportToDocx = async (title: string, steps: InstructionStep[], images: File[]) => {
  if (!window.docx || !window.saveAs) {
    console.error('docx or FileSaver library not loaded.');
    alert('DOCX export functionality is unavailable. Required libraries are missing.');
    return;
  }

  const { Document, Packer, Paragraph, ImageRun, TextRun, HeadingLevel, AlignmentType } = window.docx;

  const titleParagraph = new Paragraph({
    text: title,
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  });

  let textStepCounter = 0;
  const stepParagraphsPromises = steps.map(async (step) => {
    if (step.type === 'text') {
      textStepCounter++;
      return new Paragraph({
        children: [
          new TextRun({ text: `${textStepCounter}. `, bold: true }),
          new TextRun({ text: step.content }),
        ],
        spacing: { after: 200 },
      });
    } else if (step.type === 'image') {
      const imageIndex = parseInt(step.content, 10) - 1;
      if (imageIndex >= 0 && imageIndex < images.length) {
        try {
          const imageFile = images[imageIndex];
          const imageBuffer = await readFileAsArrayBuffer(imageFile);

          const tempImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(imageFile);
          });
          URL.revokeObjectURL(tempImage.src);

          const aspectRatio = tempImage.width / tempImage.height;
          const width = 500;
          const height = width / aspectRatio;

          return new Paragraph({
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: { width, height },
              }),
            ],
            spacing: { after: 200 },
          });
        } catch (e) {
          console.error('Error reading image for DOCX export', e);
          return null;
        }
      }
    }
    return null;
  });

  const resolvedChildren = await Promise.all(stepParagraphsPromises);
  const docChildren = [titleParagraph, ...resolvedChildren.filter((p): p is NonNullable<typeof p> => p !== null)];

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 24, // 12pt
          },
        },
        heading1: {
            run: {
                font: "Calibri",
                size: 32, // 16pt
                bold: true,
            }
        }
      },
    },
    sections: [{
      properties: {},
      children: docChildren,
    }],
  });

  const filename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'sop-instructions';
  const blob = await Packer.toBlob(doc);
  window.saveAs(blob, `${filename}.docx`);
};
