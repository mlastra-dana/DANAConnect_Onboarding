import { useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
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
        // La validación del documento no depende de la miniatura local.
      });

    return () => {
      active = false;
    };
  }, [file]);

  return (
    <div ref={containerRef} aria-label="Vista previa PDF" className="overflow-hidden rounded-lg border border-borderLight bg-surface">
      <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-sm text-grayText">
        <FileText className="h-8 w-8 text-primary" />
        <span className="font-medium text-dark">PDF cargado</span>
        <span className="max-w-full truncate">{file.name}</span>
      </div>
    </div>
  );
}
