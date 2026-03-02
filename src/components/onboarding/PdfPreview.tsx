import { useEffect, useRef } from 'react';
import { renderPdfPageToCanvas } from '../../lib/pdf/pdfUtils';

export function PdfPreview({ file }: { file: File }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    renderPdfPageToCanvas(file)
      .then((canvas) => {
        if (!active || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        canvas.className = 'h-auto max-h-56 w-full rounded-lg object-contain';
        containerRef.current.appendChild(canvas);
      })
      .catch(() => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '<p class="text-sm text-red-600">No se pudo renderizar el PDF.</p>';
      });

    return () => {
      active = false;
    };
  }, [file]);

  return <div ref={containerRef} aria-label="Vista previa PDF" className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50" />;
}
