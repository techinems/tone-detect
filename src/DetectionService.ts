import Emittery from 'emittery';
import { BroadCastifyStream, FFmpegService } from "./FFmpegService.js";
import { IDetector } from "./detectors/types.js";
import { MotorolaQCIIDetector } from "./detectors/motorolaQCIIDetector.js";
import { MotorlaQCIDetector } from "./detectors/motorlaQCIDetector.js";
import { DTMFDetector } from "./detectors/dtmfDetector.js";

export type QCIIDetectionConfig = {
  type: 'QCII';
  toneA: number;
  toneB: number;
}

export type QCIDetectionConfig = {
  type: 'QCI';
  toneSeries: 'A' | 'B' | 'Z';
  firstPair: {
    toneA: string;
    toneB: string;
  };
  secondPair: {
    toneA: string;
    toneB: string;
  };
}

export type DTMFDetectionConfig = {
  type: 'DTMF';
  sequence: string;
}

export type DetectionConfig = QCIIDetectionConfig | QCIDetectionConfig | DTMFDetectionConfig;

export interface DetectionEvents {
  detection: { configIndex: number };
  debug: string;
  error: Error;
}

export class DetectionService extends Emittery<DetectionEvents> {
  private _sampleRate: number = 8000;
  private _ffmpegService: FFmpegService;
  private _detectors: Array<{ detector: IDetector, configIndex: number }> = [];

  constructor(detectionConfigs: DetectionConfig[]) {
    super();
    this._ffmpegService = new FFmpegService(this._sampleRate);
    detectionConfigs.forEach((config, index) => this.setupDetector(config, index));
    this._ffmpegService.on('samples', (floatSamples: Float32Array) => {
      this._detectors.forEach(({ detector }) => detector.processAudioBlock(floatSamples, this._sampleRate));
    });
    this._ffmpegService.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private setupDetector(config: DetectionConfig, configIndex: number): void {
    let detector: IDetector;
    if (config.type === 'QCII') {
      detector = new MotorolaQCIIDetector(config.toneA, config.toneB);
    } else if (config.type === 'QCI') {
      detector = new MotorlaQCIDetector(
        config.toneSeries,
        config.firstPair.toneA,
        config.firstPair.toneB,
        config.secondPair.toneA,
        config.secondPair.toneB
      );
    } else if (config.type === 'DTMF') {
      detector = new DTMFDetector(config.sequence);
    } else {
      throw new Error('Invalid detector type');
    }

    this._detectors.push({ detector, configIndex });
    
    detector.on('detection', () => this.emit('detection', { configIndex }));
    detector.on('debug', (msg: string) => this.emit('debug', msg));
  }

  /**
   * Start tone detection on the specified input
   * @param input FFmpeg-compatible input (file path, URL, or device name) or a broadcastify stream
   * @param options Optional stream configuration options
   */
  startDetection(input: string | BroadCastifyStream): void {
    this.stopDetection(); // Stop any existing process
    this._ffmpegService.startStream(input);
  }

  /** Stop tone detection and clean up resources */
  stopDetection(): void {
    this._ffmpegService.stopStream();
  }
}