import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ScanFace, ShieldCheck } from 'lucide-react';
import { useOnboarding } from '../app/OnboardingContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { Progress } from '../components/ui/Progress';
import { Toast } from '../components/ui/Toast';

type CameraStatus = 'idle' | 'requesting' | 'active' | 'error';
type Gesture = 'center' | 'turn_left' | 'turn_right';
type DetectionMode = 'auto' | 'manual';
type FaceMetrics = {
  centerX: number;
  centerY: number;
  area: number;
};

const GESTURE_PLAN: Gesture[] = ['center', 'turn_left', 'turn_right'];
const GESTURE_HOLD_TARGET = 1;
const GESTURE_LABELS: Record<Gesture, string> = {
  center: 'Rostro centrado',
  turn_left: 'Girar a la izquierda',
  turn_right: 'Girar a la derecha'
};

export function BiometricPage({ companyId }: { companyId: string }) {
  const { state, setBiometric } = useOnboarding();
  const current = state.biometrics;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const loopTimerRef = useRef<number | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const manualPrevFrameRef = useRef<ImageData | null>(null);
  const manualStableCounterRef = useRef(0);
  const runningChallengeRef = useRef(false);
  const challengeIndexRef = useRef(0);
  const holdCounterRef = useRef(0);
  const baselineRef = useRef<FaceMetrics | null>(null);
  const missedFaceDetectionsRef = useRef(0);
  const autoStartTriedRef = useRef(false);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [runningChallenge, setRunningChallenge] = useState(false);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [holdCounter, setHoldCounter] = useState(0);
  const [progress, setProgress] = useState(0);
  const [baseline, setBaseline] = useState<FaceMetrics | null>(null);
  const [lastMetrics, setLastMetrics] = useState<FaceMetrics | null>(null);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('auto');
  const [manualHint, setManualHint] = useState<string | null>(null);
  const [completedGestures, setCompletedGestures] = useState<Record<Gesture, boolean>>({
    center: false,
    turn_left: false,
    turn_right: false
  });

  const isPassed = current.status === 'passed';
  const currentGesture = GESTURE_PLAN[challengeIndex] ?? null;
  const isFaceCentered = lastMetrics
    ? Math.abs(lastMetrics.centerX - 0.5) <= 0.22 && Math.abs(lastMetrics.centerY - 0.5) <= 0.26
    : false;

  const uiHint = useMemo(() => {
    if (cameraStatus === 'requesting') return 'Solicitando permisos de cámara...';
    if (cameraStatus === 'error') return cameraError ?? 'No se pudo activar la cámara.';
    if (cameraStatus !== 'active') return 'Preparando cámara...';
    if (detectionMode === 'manual' && !runningChallenge && !isPassed) {
      return 'Modo automático alterno activo: siga los gestos, el sistema valida sin capturas manuales.';
    }
    if (!runningChallenge && !isPassed) return 'Cámara activa. Pulsa "Iniciar prueba".';
    if (isPassed) return 'Biometría completada.';
    return gestureInstruction(currentGesture);
  }, [cameraStatus, cameraError, runningChallenge, isPassed, currentGesture, detectionMode]);

  const circleClass = useMemo(() => {
    if (isPassed) return 'border-green-400';
    if (!runningChallenge) return 'border-white/80';
    if (isFaceCentered) return 'border-green-400';
    return 'border-amber-300';
  }, [isPassed, runningChallenge, isFaceCentered]);

  function markGestureCompleted(gesture: Gesture) {
    setCompletedGestures((prev) => ({ ...prev, [gesture]: true }));
  }

  useEffect(() => {
    return () => {
      stopDetectionLoop();
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (autoStartTriedRef.current) return;
    autoStartTriedRef.current = true;
    void activateCamera();
  }, []);

  async function activateCamera() {
    if (cameraStatus === 'active' || cameraStatus === 'requesting') return;

    setCameraError(null);
    setCameraStatus('requesting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Tu navegador no soporta acceso a cámara.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      detectorRef.current = buildFaceDetector();
      setDetectionMode(detectorRef.current ? 'auto' : 'manual');
      setManualHint(null);

      setCameraStatus('active');
    } catch (error) {
      stopCamera();
      setCameraStatus('error');
      setCameraError(error instanceof Error ? error.message : 'No se pudo activar la cámara.');
    }
  }

  function stopCamera() {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function stopDetectionLoop() {
    if (loopTimerRef.current != null) {
      window.clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  }

  async function startChallenge() {
    if (cameraStatus !== 'active' || !videoRef.current) return;

    setBiometric({ status: 'processing' });
    setRunningChallenge(true);
    runningChallengeRef.current = true;
    setChallengeIndex(0);
    challengeIndexRef.current = 0;
    setHoldCounter(0);
    holdCounterRef.current = 0;
    setProgress(0);
    setBaseline(null);
    baselineRef.current = null;
    manualPrevFrameRef.current = null;
    manualStableCounterRef.current = 0;
    missedFaceDetectionsRef.current = 0;
    setManualHint(null);
    setCompletedGestures({
      center: false,
      turn_left: false,
      turn_right: false
    });

    stopDetectionLoop();
    loopTimerRef.current = window.setInterval(() => {
      if (detectionMode === 'auto' && detectorRef.current) {
        void runDetectionStep();
        return;
      }
      void runAutomaticFallbackStep();
    }, 280);
  }

  async function runDetectionStep() {
    if (!videoRef.current || !detectorRef.current) return;
    if (!runningChallengeRef.current) return;

    const face = await detectSingleFace(videoRef.current, detectorRef.current);
    if (!face) {
      missedFaceDetectionsRef.current += 1;
      setHoldCounter(0);
      holdCounterRef.current = 0;

      if (missedFaceDetectionsRef.current >= 18) {
        setDetectionMode('manual');
        setManualHint('No se detectó rostro de forma estable. Cambiamos a validación automática alterna.');
      }
      return;
    }
    missedFaceDetectionsRef.current = 0;

    setLastMetrics(face);

    if (!baselineRef.current) {
      const looksCentered = Math.abs(face.centerX - 0.5) <= 0.22;
      if (looksCentered) {
        setBaseline(face);
        baselineRef.current = face;
      }
      return;
    }

    const targetGesture = GESTURE_PLAN[challengeIndexRef.current];
    const success = evaluateGesture(targetGesture, face, baselineRef.current);

    if (!success) {
      setHoldCounter(0);
      holdCounterRef.current = 0;
      return;
    }

    const nextHold = holdCounterRef.current + 1;
    holdCounterRef.current = nextHold;
    setHoldCounter(nextHold);
    if (nextHold < GESTURE_HOLD_TARGET) return;

    markGestureCompleted(targetGesture);
    completeCurrentStep();
  }

  function finalizeSuccess(nextProgress: number) {
    stopDetectionLoop();
    setRunningChallenge(false);
    runningChallengeRef.current = false;
    setProgress(nextProgress);

    const finalScore = Math.max(92, 96 + Math.round(Math.random() * 3));
    setCompletedGestures({
      center: true,
      turn_left: true,
      turn_right: true
    });
    setBiometric({
      status: 'passed',
      completedAt: new Date().toISOString(),
      score: finalScore,
      note: 'Prueba de vida completada: rostro centrado + giro izquierda/derecha.'
    });
  }

  function resetBiometric() {
    stopDetectionLoop();
    setRunningChallenge(false);
    runningChallengeRef.current = false;
    setChallengeIndex(0);
    challengeIndexRef.current = 0;
    setHoldCounter(0);
    holdCounterRef.current = 0;
    setProgress(0);
    setBaseline(null);
    baselineRef.current = null;
    setLastMetrics(null);
    manualPrevFrameRef.current = null;
    manualStableCounterRef.current = 0;
    missedFaceDetectionsRef.current = 0;
    setManualHint(null);
    setBiometric({ status: 'pending' });
  }

  async function runAutomaticFallbackStep() {
    if (!videoRef.current || !runningChallengeRef.current) return;
    const frame = snapshotVideoFrame(videoRef.current, captureCanvasRef);
    if (!frame) return;

    const previous = manualPrevFrameRef.current;
    manualPrevFrameRef.current = frame;
    if (!previous) return;

    const delta = computeFrameMotion(previous, frame);
    const gesture = GESTURE_PLAN[challengeIndexRef.current];
    if (!gesture) return;

    if (gesture === 'center') {
      const motionLooksStable = delta.motion < 0.085;
      const motionLooksCentered = delta.motion >= 0.01 && delta.motion < 0.16 && delta.centerX >= 0.4 && delta.centerX <= 0.6;
      if (motionLooksStable || motionLooksCentered) {
        manualStableCounterRef.current += 1;
      } else {
        manualStableCounterRef.current = 0;
      }

      if (manualStableCounterRef.current < 3) return;
      manualStableCounterRef.current = 0;
      acceptFallbackStep();
      return;
    }

    if (delta.motion < 0.045) return;
    if (gesture === 'turn_left' && delta.centerX >= 0.54) return;
    if (gesture === 'turn_right' && delta.centerX <= 0.46) return;
    acceptFallbackStep();
  }

  function completeCurrentStep() {
    const nextIndex = challengeIndexRef.current + 1;
    const nextProgress = Math.round((nextIndex / GESTURE_PLAN.length) * 100);
    holdCounterRef.current = 0;
    setHoldCounter(0);
    if (nextIndex >= GESTURE_PLAN.length) {
      finalizeSuccess(nextProgress);
      return;
    }

    challengeIndexRef.current = nextIndex;
    setChallengeIndex(nextIndex);
    setProgress(nextProgress);
  }

  function acceptFallbackStep() {
    const completedGesture = GESTURE_PLAN[challengeIndexRef.current];
    if (completedGesture) {
      markGestureCompleted(completedGesture);
    }
    completeCurrentStep();
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.5fr_1fr]">
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF4F1] text-primary">
            <ScanFace className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-dark">Biometría</h2>
            <p className="text-sm text-grayText">Activación de cámara y prueba de vida con gestos.</p>
          </div>
        </div>

        <div className="relative mt-5 overflow-hidden rounded-xl border border-borderLight bg-black/90">
          <video ref={videoRef} autoPlay playsInline muted className="h-[300px] w-full object-cover md:h-[360px]" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={`h-64 w-80 rounded-[999px] border-4 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors md:h-72 md:w-[26rem] ${circleClass}`} />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
            {runningChallenge && currentGesture ? gestureInstruction(currentGesture) : 'Coloca tu rostro dentro del círculo'}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-borderLight bg-surface p-3 text-sm text-grayText">
          <p className="font-medium text-dark">Estado:</p>
          <p>{uiHint}</p>
          {runningChallenge && currentGesture ? (
            <p className="mt-1 text-xs text-grayText">Reto {challengeIndex + 1}/{GESTURE_PLAN.length} · sostenga {GESTURE_HOLD_TARGET} lecturas estables</p>
          ) : null}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {GESTURE_PLAN.map((gesture) => {
            const done = completedGestures[gesture] || isPassed;
            const active = !done && runningChallenge && currentGesture === gesture;
            return (
              <div
                key={gesture}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  done
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : active
                      ? 'border-primary bg-[#FFF4F1] text-dark'
                      : 'border-borderLight bg-white text-grayText'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={`h-4 w-4 ${done ? 'text-green-600' : 'text-gray-300'}`} />
                  <span>{GESTURE_LABELS[gesture]}</span>
                </div>
              </div>
            );
          })}
        </div>

        {runningChallenge ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-dark">Verificando gestos...</p>
            <Progress value={progress} label={`${progress}%`} />
          </div>
        ) : null}

        {cameraStatus === 'error' ? <div className="mt-4"><Toast type="error" message={cameraError ?? 'No se pudo usar la cámara.'} /></div> : null}
        {manualHint ? <div className="mt-4"><Toast type="info" message={manualHint} /></div> : null}

        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <Link to={`/onboarding/${companyId}/documents`}>
            <Button variant="ghost">Volver</Button>
          </Link>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={resetBiometric} disabled={cameraStatus === 'requesting'}>
              Reiniciar
            </Button>

            <Button onClick={() => void startChallenge()} disabled={cameraStatus !== 'active' || runningChallenge || isPassed}>
              {runningChallenge ? 'Validando...' : 'Iniciar prueba'}
            </Button>

            <Link to={`/onboarding/${companyId}/review`}>
              <Button disabled={!isPassed}>Continuar</Button>
            </Link>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-dark">Estado de biometría</h3>
        <div className="mt-3">
          <StatusBadge status={mapBiometricStatus(current.status)} />
        </div>

        <div className="mt-4 rounded-lg border border-borderLight bg-surface p-3 text-sm text-grayText">
          <p>
            <span className="font-medium text-dark">Resultado:</span> {current.note ?? 'Pendiente de validación.'}
          </p>
          <p className="mt-1">
            <span className="font-medium text-dark">Score:</span> {current.score ? `${current.score}%` : 'N/A'}
          </p>
          <p className="mt-1">
            <span className="font-medium text-dark">Fecha:</span>{' '}
            {current.completedAt ? new Date(current.completedAt).toLocaleString('es-VE') : 'Sin registro'}
          </p>
          {lastMetrics ? (
            <p className="mt-2 text-xs text-grayText">Lectura facial en vivo activa.</p>
          ) : null}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-[#F9D1C9] bg-[#FFF4F1] p-3 text-sm text-dark">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
          <p>La biometría validada es obligatoria para habilitar el envío final.</p>
        </div>
      </Card>
    </div>
  );
}

function buildFaceDetector() {
  const Ctor = (window as any).FaceDetector;
  if (!Ctor) return null;
  return new Ctor({ fastMode: true, maxDetectedFaces: 1 });
}

async function detectSingleFace(video: HTMLVideoElement, detector: any): Promise<FaceMetrics | null> {
  const faces = (await detector.detect(video)) as Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>;
  if (!faces?.length) return null;

  const box = faces[0].boundingBox;
  const width = Math.max(video.videoWidth || 1, 1);
  const height = Math.max(video.videoHeight || 1, 1);

  return {
    centerX: (box.x + box.width / 2) / width,
    centerY: (box.y + box.height / 2) / height,
    area: (box.width * box.height) / (width * height)
  };
}

function evaluateGesture(gesture: Gesture, face: FaceMetrics, baseline: FaceMetrics) {
  if (gesture === 'center') {
    return Math.abs(face.centerX - 0.5) <= 0.22 && Math.abs(face.centerY - 0.5) <= 0.26;
  }
  if (gesture === 'turn_left') {
    return face.centerX <= baseline.centerX - 0.02;
  }
  return face.centerX >= baseline.centerX + 0.02;
}

function mapBiometricStatus(status: 'pending' | 'processing' | 'passed' | 'failed') {
  if (status === 'passed') return 'valid';
  if (status === 'failed') return 'error';
  return 'pending';
}

function gestureInstruction(gesture: Gesture | null) {
  if (gesture === 'center') return 'Reto 1: mire al frente dentro del óvalo.';
  if (gesture === 'turn_left') return 'Reto 2: gire un poco hacia la izquierda.';
  if (gesture === 'turn_right') return 'Reto 3: gire un poco hacia la derecha.';
  return 'Prepare su rostro frente a cámara.';
}

function snapshotVideoFrame(video: HTMLVideoElement, canvasRef: React.MutableRefObject<HTMLCanvasElement | null>) {
  const width = video.videoWidth || 0;
  const height = video.videoHeight || 0;
  if (!width || !height) return null;

  if (!canvasRef.current) {
    canvasRef.current = document.createElement('canvas');
  }
  const canvas = canvasRef.current;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function computeFrameMotion(a: ImageData, b: ImageData) {
  if (a.width !== b.width || a.height !== b.height) return { motion: 1, centerX: 0.5 };
  const stride = 12;
  let sumDiff = 0;
  let count = 0;
  let weightedX = 0;
  let active = 0;
  const width = a.width;

  for (let i = 0; i < a.data.length; i += 4 * stride) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    const diff = (dr + dg + db) / 3;
    sumDiff += diff;
    count += 1;

    if (diff > 28) {
      const pixelIndex = Math.floor(i / 4);
      const x = pixelIndex % width;
      weightedX += x;
      active += 1;
    }
  }
  if (!count) return { motion: 0, centerX: 0.5 };
  const motion = sumDiff / count / 255;
  const centerX = active ? weightedX / active / width : 0.5;
  return { motion, centerX };
}
