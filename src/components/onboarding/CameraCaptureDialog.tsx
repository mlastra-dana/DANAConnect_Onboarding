import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check, Loader2, RefreshCw, RotateCcw, RotateCw, SwitchCamera, Undo2, X } from 'lucide-react';

export function CameraCaptureDialog({ label, fileName, language, onClose, onConfirm }: {
  label: string;
  fileName: string;
  language: 'es' | 'en';
  onClose: () => void;
  onConfirm: (file: File) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const titleId = useId();
  const [deviceId, setDeviceId] = useState<string>();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const en = language === 'en';

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    setReady(false);
    setError('');

    async function openCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError(en ? 'Camera unavailable. Use HTTPS or upload a file.' : 'Cámara no disponible. Use HTTPS o suba un archivo.');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          if (active && video.readyState >= 2) setReady(true);
        }
        try {
          const available = await navigator.mediaDevices.enumerateDevices();
          if (active) setDevices(available.filter((device) => device.kind === 'videoinput'));
        } catch {
          if (active) setDevices([]);
        }
      } catch (cause) {
        stream?.getTracks().forEach((track) => track.stop());
        if (!active) return;
        const name = cause instanceof Error ? cause.name : '';
        setError(name === 'NotAllowedError'
          ? en ? 'Camera permission denied. You can upload a file.' : 'Permiso de cámara denegado. Puede subir un archivo.'
          : name === 'NotFoundError'
            ? en ? 'No camera found. You can upload a file.' : 'No se encontró una cámara. Puede subir un archivo.'
            : en ? 'Unable to access the camera. Try again or upload a file.' : 'No se pudo acceder a la cámara. Reintente o suba un archivo.');
      }
    }
    void openCamera();
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) streamRef.current = null;
    };
  }, [deviceId, attempt, en]);

  function switchCamera() {
    const current = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
    const index = devices.findIndex((device) => device.deviceId === current);
    const next = devices[(index + 1) % devices.length];
    if (next) setDeviceId(next.deviceId);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2560 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvasRef.current = canvas;
    setPreview(canvas.toDataURL('image/jpeg', 0.95));
  }

  function rotate(direction: -1 | 1) {
    const original = canvasRef.current;
    if (!original) return;
    const rotated = document.createElement('canvas');
    rotated.width = original.height;
    rotated.height = original.width;
    const context = rotated.getContext('2d');
    if (!context) return;
    context.translate(rotated.width / 2, rotated.height / 2);
    context.rotate(direction * Math.PI / 2);
    context.drawImage(original, -original.width / 2, -original.height / 2);
    canvasRef.current = rotated;
    setPreview(rotated.toDataURL('image/jpeg', 0.95));
  }

  async function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;
    setSaving(true);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!dialogRef.current?.open) return;
    if (!blob) {
      setSaving(false);
      setError(en ? 'Unable to save the image. Try again.' : 'No se pudo guardar la imagen. Intente nuevamente.');
      return;
    }
    onConfirm(new File([blob], `${fileName}-camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  }

  const iconButton = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-borderLight bg-white text-dark transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40';

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="m-auto max-h-[94dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-lg border border-borderLight bg-white p-0 text-dark shadow-soft backdrop:bg-black/60"
    >
      <header className="flex items-center justify-between gap-4 border-b border-borderLight px-4 py-3">
        <h2 id={titleId} className="min-w-0 break-words text-base font-semibold">{label}</h2>
        <button type="button" className={iconButton} onClick={onClose} aria-label={en ? 'Close camera' : 'Cerrar cámara'} title={en ? 'Close camera' : 'Cerrar cámara'}>
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="relative mx-auto my-4 aspect-[4/3] w-[calc(100%_-_2rem)] max-h-[55dvh] overflow-hidden rounded-lg bg-zinc-950">
        <video ref={videoRef} muted playsInline onLoadedData={() => setReady(true)} className={`h-full w-full object-contain ${preview || error ? 'invisible' : ''}`} />
        {preview ? <img src={preview} alt={en ? 'Captured document' : 'Documento capturado'} className="absolute inset-0 h-full w-full object-contain" /> : null}
        {!preview && !ready && !error ? <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white"><Loader2 className="h-6 w-6 animate-spin" />{en ? 'Starting camera...' : 'Activando cámara...'}</div> : null}
        {error && !preview ? <div role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">{error}</div> : null}
      </div>
      {error && preview ? <p role="alert" className="px-4 text-sm text-red-700">{error}</p> : null}
      <footer className="flex items-center justify-center gap-3 border-t border-borderLight p-4">
        {preview ? <>
          <button type="button" className={iconButton} disabled={saving} onClick={() => { canvasRef.current = null; setPreview(''); setError(''); }} aria-label={en ? 'Retake' : 'Repetir captura'} title={en ? 'Retake' : 'Repetir captura'}><Undo2 className="h-5 w-5" /></button>
          <button type="button" className={iconButton} disabled={saving} onClick={() => rotate(-1)} aria-label={en ? 'Rotate left' : 'Girar a la izquierda'} title={en ? 'Rotate left' : 'Girar a la izquierda'}><RotateCcw className="h-5 w-5" /></button>
          <button type="button" className={iconButton} disabled={saving} onClick={() => rotate(1)} aria-label={en ? 'Rotate right' : 'Girar a la derecha'} title={en ? 'Rotate right' : 'Girar a la derecha'}><RotateCw className="h-5 w-5" /></button>
          <button type="button" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-white hover:bg-primaryHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40" disabled={saving} onClick={() => void confirm()} aria-label={en ? 'Use image' : 'Usar imagen'} title={en ? 'Use image' : 'Usar imagen'}>{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-6 w-6" />}</button>
        </> : <>
          <button type="button" className={iconButton} disabled={!ready || devices.length < 2} onClick={switchCamera} aria-label={en ? 'Switch camera' : 'Cambiar cámara'} title={en ? 'Switch camera' : 'Cambiar cámara'}><SwitchCamera className="h-5 w-5" /></button>
          <button type="button" className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-white bg-primary text-white ring-2 ring-primary transition hover:bg-primaryHover focus-visible:outline-none focus-visible:ring-4 disabled:opacity-40" disabled={!ready || Boolean(error)} onClick={capture} aria-label={en ? 'Capture document' : 'Capturar documento'} title={en ? 'Capture document' : 'Capturar documento'}><Camera className="h-6 w-6" /></button>
          {error ? <button type="button" className={iconButton} onClick={() => setAttempt((value) => value + 1)} aria-label={en ? 'Retry camera' : 'Reintentar cámara'} title={en ? 'Retry camera' : 'Reintentar cámara'}><RefreshCw className="h-5 w-5" /></button> : <span className="w-11 shrink-0" aria-hidden="true" />}
        </>}
      </footer>
    </dialog>, document.body
  );
}
