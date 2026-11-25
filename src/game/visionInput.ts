import {
  computeArmTrackingAngles,
  computeBodyMoveDir,
  type ArmTrackingTarget,
  type Landmark2D,
} from './visionMath';

export interface VisionStateSnapshot {
  active: boolean;
  statusText: string;
  moveLabel: string;
  statusTone: 'neutral' | 'ready' | 'attack' | 'guard' | 'error';
  tiltMoveDir: number;
  isFist: boolean;
  isOpenPalm: boolean;
  armTarget: ArmTrackingTarget;
}

type VisionCallback = (snapshot: VisionStateSnapshot) => void;

interface MediaPipeLandmark extends Landmark2D {
  z?: number;
}

interface MediaPipeHandsResult {
  multiHandLandmarks?: MediaPipeLandmark[][];
}

interface MediaPipePoseResult {
  poseLandmarks?: MediaPipeLandmark[];
}

interface MediaPipeRunner<T> {
  setOptions: (opts: Record<string, unknown>) => void;
  onResults: (cb: (res: T) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => Promise<void>;
}

declare global {
  interface Window {
    Hands?: new (cfg: { locateFile: (file: string) => string }) => MediaPipeRunner<MediaPipeHandsResult>;
    Pose?: new (cfg: { locateFile: (file: string) => string }) => MediaPipeRunner<MediaPipePoseResult>;
  }
}

const DEFAULT_ARM_TARGET: ArmTrackingTarget = {
  hasArm: false,
  shoulderPitch: -0.45,
  shoulderRoll: -0.22,
  elbowBend: -0.95,
  wristTwist: 0,
  armSpeed: 0,
};

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export class VisionController {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private rafId = 0;
  private busy = false;
  private stopped = false;
  private hands: MediaPipeRunner<MediaPipeHandsResult> | null = null;
  private pose: MediaPipeRunner<MediaPipePoseResult> | null = null;

  private prevFist = false;
  private pendingAttackEdge = false;
  private lastSwingTriggerMs = 0;
  private lastPoseMs = performance.now();
  private prevArmWrist: Landmark2D | null = null;
  private latestHandLandmarks: MediaPipeLandmark[] | null = null;
  private latestArmPoints: {
    shoulder: Landmark2D;
    elbow: Landmark2D;
    wrist: Landmark2D;
  } | null = null;

  private state: VisionStateSnapshot = {
    active: false,
    statusText: 'Camera standby',
    moveLabel: 'Diam',
    statusTone: 'neutral',
    tiltMoveDir: 0,
    isFist: false,
    isOpenPalm: false,
    armTarget: { ...DEFAULT_ARM_TARGET },
  };

  private drawPipOverlay() {
    const canvas = this.canvasEl;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Draw Arm Skeleton (Shoulder -> Elbow -> Wrist)
    if (this.latestArmPoints) {
      const { shoulder, elbow, wrist } = this.latestArmPoints;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(shoulder.x * w, shoulder.y * h);
      ctx.lineTo(elbow.x * w, elbow.y * h);
      ctx.lineTo(wrist.x * w, wrist.y * h);
      ctx.stroke();

      for (const pt of [shoulder, elbow, wrist]) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Draw Hand Landmarks
    if (this.latestHandLandmarks) {
      ctx.fillStyle = this.state.isFist ? '#f43f5e' : '#06b6d4';
      for (const pt of this.latestHandLandmarks) {
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  public async start(
    video: HTMLVideoElement,
    overlayCanvas: HTMLCanvasElement,
    onUpdate: VisionCallback
  ): Promise<void> {
    this.stopped = false;
    this.videoEl = video;
    this.canvasEl = overlayCanvas;

    onUpdate({
      ...this.state,
      statusText: 'Loading vision models...',
      statusTone: 'neutral',
    });

    try {
      await Promise.all([
        loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'),
        loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js'),
      ]);

      if (this.stopped) return;

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user', frameRate: { ideal: 30 } },
        audio: false,
      });

      if (this.stopped) {
        this.stop();
        return;
      }

      video.srcObject = this.stream;
      await video.play();

      if (!window.Hands || !window.Pose) {
        throw new Error('MediaPipe constructors unavailable');
      }

      // Use modelComplexity: 0 (Lite) + parallel Promise.all for minimal latency
      this.hands = new window.Hands({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      });
      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      this.pose = new window.Pose({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
      });
      this.pose.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });

      this.hands.onResults((res) => {
        const landmarks = res.multiHandLandmarks?.[0] ?? null;
        this.latestHandLandmarks = landmarks;

        if (!landmarks) {
          this.prevFist = false;
          this.state = {
            ...this.state,
            active: true,
            isFist: false,
            isOpenPalm: false,
            statusText: 'Arahkan tangan & lengan',
            statusTone: 'neutral',
          };
          this.drawPipOverlay();
          onUpdate(this.state);
          return;
        }

        const wrist = landmarks[0];
        const mcp9 = landmarks[9];
        const handScale = Math.max(0.06, Math.hypot(mcp9.x - wrist.x, mcp9.y - wrist.y));

        let closedFingers = 0;
        for (const tipIdx of [8, 12, 16, 20]) {
          const dist = Math.hypot(landmarks[tipIdx].x - wrist.x, landmarks[tipIdx].y - wrist.y);
          if (dist / handScale < 1.35) closedFingers++;
        }

        const isFist = closedFingers >= 3;
        const isOpenPalm = closedFingers === 0;

        // Edge-trigger strike when closing hand into a fist
        if (isFist && !this.prevFist) {
          this.pendingAttackEdge = true;
          this.lastSwingTriggerMs = performance.now();
        }
        this.prevFist = isFist;

        this.state = {
          ...this.state,
          active: true,
          isFist,
          isOpenPalm,
          statusText: isFist ? 'Kepal · Tebas!' : isOpenPalm ? 'Buka · Guard' : 'Siap',
          statusTone: isFist ? 'attack' : isOpenPalm ? 'guard' : 'ready',
        };
        this.drawPipOverlay();
        onUpdate(this.state);
      });

      this.pose.onResults((res) => {
        const lm = res.poseLandmarks;
        if (!lm || !lm[11] || !lm[12]) return;

        // 1. Body Movement: Left = Mundur (-1), Right = Maju (+1)
        const shoulderCenterX = (lm[11].x + lm[12].x) * 0.5;
        const moveDir = computeBodyMoveDir(shoulderCenterX, 0.05);
        this.state.tiltMoveDir = moveDir;
        this.state.moveLabel =
          moveDir < -0.15 ? '← Mundur' : moveDir > 0.15 ? 'Maju →' : 'Diam';

        // 2. Arm Detection: select more active/visible arm (12-14-16 vs 11-13-15)
        const rVis = (lm[12]?.visibility ?? 0) + (lm[14]?.visibility ?? 0) + (lm[16]?.visibility ?? 0);
        const lVis = (lm[11]?.visibility ?? 0) + (lm[13]?.visibility ?? 0) + (lm[15]?.visibility ?? 0);

        const useRight = rVis >= lVis - 0.15;
        const shoulder = useRight ? lm[12] : lm[11];
        const elbow = useRight ? lm[14] : lm[13];
        const wrist = useRight ? lm[16] : lm[15];

        const nowMs = performance.now();
        const poseDt = Math.max(0.016, (nowMs - this.lastPoseMs) / 1000);
        this.lastPoseMs = nowMs;

        if (shoulder && elbow && wrist && (wrist.visibility ?? 1) > 0.3) {
          this.latestArmPoints = { shoulder, elbow, wrist };
          const handWrist = this.latestHandLandmarks?.[0];
          const handIndex = this.latestHandLandmarks?.[5];
          const armTarget = computeArmTrackingAngles(
            shoulder,
            elbow,
            wrist,
            handWrist,
            handIndex,
            this.prevArmWrist,
            poseDt
          );
          this.prevArmWrist = { x: wrist.x, y: wrist.y };
          this.state.armTarget = armTarget;

          // Brisk arm swing while holding a fist also triggers a strike!
          if (
            this.state.isFist &&
            armTarget.armSpeed > 1.85 &&
            nowMs - this.lastSwingTriggerMs > 280
          ) {
            this.pendingAttackEdge = true;
            this.lastSwingTriggerMs = nowMs;
          }
        } else {
          this.latestArmPoints = null;
          this.prevArmWrist = null;
          this.state.armTarget = { ...DEFAULT_ARM_TARGET };
        }

        this.drawPipOverlay();
        onUpdate(this.state);
      });

      let frameCounter = 0;
      const pump = () => {
        if (this.stopped) return;
        this.rafId = requestAnimationFrame(pump);
        if (this.busy || !this.videoEl || this.videoEl.readyState < 2) return;
        this.busy = true;
        frameCounter++;

        // Run hands and pose in parallel (pose every 2nd frame for low CPU overhead)
        const jobs: Promise<void>[] = [];
        if (this.hands) jobs.push(this.hands.send({ image: this.videoEl }));
        if (this.pose && frameCounter % 2 === 0) jobs.push(this.pose.send({ image: this.videoEl }));

        Promise.all(jobs)
          .catch(() => {})
          .finally(() => {
            this.busy = false;
          });
      };
      this.rafId = requestAnimationFrame(pump);
    } catch {
      this.state = {
        active: false,
        statusText: 'Webcam unavailable · Use Keyboard',
        moveLabel: 'Diam',
        statusTone: 'error',
        tiltMoveDir: 0,
        isFist: false,
        isOpenPalm: false,
        armTarget: { ...DEFAULT_ARM_TARGET },
      };
      onUpdate(this.state);
    }
  }

  public consumeAttackEdge(): boolean {
    if (!this.pendingAttackEdge) return false;
    this.pendingAttackEdge = false;
    return true;
  }

  public getSnapshot(): VisionStateSnapshot {
    return this.state;
  }

  public stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.rafId);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
    void this.hands?.close?.();
    void this.pose?.close?.();
    this.hands = null;
    this.pose = null;
    this.prevFist = false;
    this.pendingAttackEdge = false;
    this.prevArmWrist = null;
    this.latestArmPoints = null;
    this.latestHandLandmarks = null;
  }
}
