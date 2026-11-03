import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

export interface ExportPdfOptions {
  filename: string;
  orientation?: 'landscape' | 'portrait';
  format?: 'a4' | 'letter' | 'legal' | [number, number];
  widthMm?: number;
  paddingMm?: number;
  scale?: number;
}

/**
 * Robust, production-grade PDF export using html2canvas-pro (native oklch support) and jsPDF.
 * - Supports Tailwind CSS v4 oklch() color spaces without crashing
 * - Never opens browser print dialog
 * - Cleans up all offscreen overlays and iframes in finally block to prevent UI freeze
 */
export async function downloadElementAsPdf(
  targetElement: HTMLElement,
  options: ExportPdfOptions
): Promise<void> {
  const {
    filename,
    orientation = 'landscape',
    format = 'a4',
    paddingMm = 6,
    scale = 2
  } = options;

  let container: HTMLDivElement | null = null;

  try {
    // 1. Determine width in mm and px (96 DPI standard: 1mm = 3.7795275591px)
    const mmToPx = (mm: number) => mm * 3.779528;
    let targetWidthMm = options.widthMm;
    if (!targetWidthMm) {
      if (format === 'a4') {
        targetWidthMm = orientation === 'landscape' ? 297 : 210;
      } else if (format === 'letter') {
        targetWidthMm = orientation === 'landscape' ? 279.4 : 215.9;
      } else if (format === 'legal') {
        targetWidthMm = orientation === 'landscape' ? 355.6 : 215.9;
      } else if (Array.isArray(format)) {
        targetWidthMm = format[0];
      } else {
        targetWidthMm = orientation === 'landscape' ? 297 : 210;
      }
    }

    const targetWidthPx = Math.round(mmToPx(targetWidthMm));

    // 2. Clone the element cleanly
    const clone = targetElement.cloneNode(true) as HTMLElement;
    clone.id = 'temp-pdf-export-clone';
    clone.classList.remove('hidden', 'print:block', 'buying-print-output');
    clone.style.display = 'block';
    clone.style.visibility = 'visible';
    clone.style.width = `${targetWidthPx}px`;
    clone.style.minWidth = `${targetWidthPx}px`;
    clone.style.maxWidth = `${targetWidthPx}px`;
    clone.style.boxSizing = 'border-box';
    clone.style.backgroundColor = '#ffffff';
    clone.style.color = '#111827';
    clone.style.padding = `${paddingMm}mm`;

    // 3. Wrap in offscreen container at high z-index and minimal opacity for measurement
    container = document.createElement('div');
    container.id = 'temp-pdf-export-container';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = `${targetWidthPx}px`;
    container.style.backgroundColor = '#ffffff';
    container.style.zIndex = '99999';
    container.style.opacity = '0.005';
    container.style.pointerEvents = 'none';
    container.style.overflow = 'visible';
    container.appendChild(clone);
    document.body.appendChild(container);

    // 4. Brief delay to ensure fonts and styles settle
    await new Promise((resolve) => setTimeout(resolve, 250));

    // 5. Render canvas using html2canvas-pro (handles Tailwind v4 oklch)
    const canvas = await html2canvas(clone, {
      scale,
      useCORS: true,
      logging: false,
      scrollY: 0,
      scrollX: 0,
      backgroundColor: '#ffffff'
    });

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas rendering produced an empty image.');
    }

    // 6. Generate PDF with jsPDF
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginMm = paddingMm;
    const printableW = pageW - marginMm * 2;
    const printableH = pageH - marginMm * 2;

    const totalImgH = (canvas.height * printableW) / canvas.width;

    if (totalImgH <= printableH) {
      // Single page fits completely
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      doc.addImage(imgData, 'JPEG', marginMm, marginMm, printableW, totalImgH);
    } else {
      // Multi-page slicing
      let sourceY = 0;
      let remainingH = totalImgH;

      while (remainingH > 0) {
        const sliceH = Math.min(remainingH, printableH);
        const sliceCanvasH = Math.round((sliceH / printableW) * canvas.width);

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceCanvasH;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sliceCanvasH,
            0,
            0,
            canvas.width,
            sliceCanvasH
          );

          const sliceData = pageCanvas.toDataURL('image/jpeg', 0.98);
          if (sourceY > 0) {
            doc.addPage();
          }
          doc.addImage(sliceData, 'JPEG', marginMm, marginMm, printableW, sliceH);
        }

        sourceY += sliceCanvasH;
        remainingH -= sliceH;
      }
    }

    doc.save(filename);
  } finally {
    // 7. Cleanup container and any stray html2canvas artifacts
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    const leftOver = document.getElementById('temp-pdf-export-container');
    if (leftOver) leftOver.remove();

    document.querySelectorAll('iframe, .html2canvas-container').forEach((el) => {
      if (el.id?.includes('html2canvas') || el.className?.includes('html2canvas')) {
        el.remove();
      }
    });
  }
}
