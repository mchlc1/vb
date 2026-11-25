import {
  computeArmTrackingAngles,
  computeBodyMoveDir,
  evaluateArmGestures,
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
  isShieldRaised: boolean;
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
  private prevHandWrist: Landmark2D | null = null;
  private lastHandMs = performance.now();
  private latestHandLandmarks: MediaPipeLandmark[] | null = null;
  private latestArmPoints: {
    shoulder: Landmark2D;
    elbow: Landmark2D;
    wrist: Landmark2D;
  } | null = null;
  private latestOffArmPoints: {
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
    isShieldRaised: false,
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

    // 1. Draw Off-Arm Skeleton (Shield Arm in Cyan/Blue)
    if (this.latestOffArmPoints) {
      const { shoulder, elbow, wrist } = this.latestOffArmPoints;
      ctx.strokeStyle = this.state.isShieldRaised ? '#38bdf8' : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(shoulder.x * w, shoulder.y * h);
      ctx.lineTo(elbow.x * w, elbow.y * h);
      ctx.lineTo(wrist.x * w, wrist.y * h);
      ctx.stroke();
    }

    // 2. Draw Sword Arm Skeleton (Shoulder -> Elbow -> Wrist in Amber)
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

    // 3. Draw Hand Landmarks
    if (this.latestHandLandmarks) {
      ctx.fillStyle = this.state.isShieldRaised
        ? '#38bdf8'
        : this.state.isFist
        ? '#f43f5e'
        : '#fbbf24';
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
        const nowMs = performance.now();
        const handDt = Math.max(0.016, (nowMs - this.lastHandMs) / 1000);
        this.lastHandMs = nowMs;

        if (!landmarks) {
          this.prevFist = false;
          this.prevHandWrist = null;
          this.state = {
            ...this.state,
            active: true,
            isFist: false,
            isOpenPalm: false,
            statusText: this.state.isShieldRaised
              ? 'Angkat Tangan · Perisai!'
              : 'Arahkan tangan & lengan',
            statusTone: this.state.isShieldRaised ? 'guard' : 'neutral',
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
        const justClosedFist = isFist && !this.prevFist;
        this.prevFist = isFist;

        // Measure hand wrist speed in case Pose missed a quick swing
        let handSpeed = this.state.armTarget.armSpeed;
        if (this.prevHandWrist) {
          const hs =
            Math.hypot(wrist.x - this.prevHandWrist.x, wrist.y - this.prevHandWrist.y) / handDt;
          handSpeed = Math.max(handSpeed, hs);
        }
        this.prevHandWrist = { x: wrist.x, y: wrist.y };

        const gesture = evaluateArmGestures({
          swordShoulder: this.latestArmPoints?.shoulder,
          swordWrist: this.latestArmPoints?.wrist,
          offShoulder: this.latestOffArmPoints?.shoulder,
          offWrist: this.latestOffArmPoints?.wrist,
          handWrist: wrist,
          armSpeed: handSpeed,
          isOpenPalm,
          isFist,
          justClosedFist,
        });

        if (gesture.shouldSwing && nowMs - this.lastSwingTriggerMs > 260) {
          this.pendingAttackEdge = true;
          this.lastSwingTriggerMs = nowMs;
        }

        this.state = {
          ...this.state,
          active: true,
          isFist,
          isOpenPalm,
          isShieldRaised: gesture.isShieldRaised,
          statusText: gesture.shouldSwing
            ? 'Ayun Lengan · Tebas!'
            : gesture.isShieldRaised
            ? 'Angkat Tangan · Perisai!'
            : 'Siap Bertarung',
          statusTone: gesture.shouldSwing
            ? 'attack'
            : gesture.isShieldRaised
            ? 'guard'
            : 'ready',
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

        // 2. Sword Arm + Off-Arm Detection
        const rVis = (lm[12]?.visibility ?? 0) + (lm[14]?.visibility ?? 0) + (lm[16]?.visibility ?? 0);
        const lVis = (lm[11]?.visibility ?? 0) + (lm[13]?.visibility ?? 0) + (lm[15]?.visibility ?? 0);

        const useRight = rVis >= lVis - 0.15;
        const shoulder = useRight ? lm[12] : lm[11];
        const elbow = useRight ? lm[14] : lm[13];
        const wrist = useRight ? lm[16] : lm[15];

        const offShoulder = useRight ? lm[11] : lm[12];
        const offElbow = useRight ? lm[13] : lm[14];
        const offWrist = useRight ? lm[15] : lm[16];

        if (offShoulder && offElbow && offWrist && (offWrist.visibility ?? 0) > 0.35) {
          this.latestOffArmPoints = { shoulder: offShoulder, elbow: offElbow, wrist: offWrist };
        } else {
          this.latestOffArmPoints = null;
        }

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

          // Evaluate raised-hand shield guard vs arm-swing sword strike directly from Pose + Hand!
          const gesture = evaluateArmGestures({
            swordShoulder: shoulder,
            swordWrist: wrist,
            offShoulder: this.latestOffArmPoints?.shoulder,
            offWrist: this.latestOffArmPoints?.wrist,
            handWrist,
            armSpeed: armTarget.armSpeed,
            isOpenPalm: this.state.isOpenPalm,
            isFist: this.state.isFist,
            justClosedFist: false,
          });

          this.state.isShieldRaised = gesture.isShieldRaised;

          if (gesture.shouldSwing && nowMs - this.lastSwingTriggerMs > 260) {
            this.pendingAttackEdge = true;
            this.lastSwingTriggerMs = nowMs;
            this.state.statusText = 'Ayun Lengan · Tebas!';
            this.state.statusTone = 'attack';
          } else if (gesture.isShieldRaised) {
            this.state.statusText = 'Angkat Tangan · Perisai!';
            this.state.statusTone = 'guard';
          } else {
            this.state.statusText = 'Siap Bertarung';
            this.state.statusTone = 'ready';
          }
        } else {
          this.latestArmPoints = null;
          this.prevArmWrist = null;
          this.state.armTarget = { ...DEFAULT_ARM_TARGET };
          this.state.isShieldRaised = this.state.isOpenPalm;
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
        isShieldRaised: false,
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
    this.prevHandWrist = null;
    this.latestArmPoints = null;
    this.latestOffArmPoints = null;
    this.latestHandLandmarks = null;
  }
}
