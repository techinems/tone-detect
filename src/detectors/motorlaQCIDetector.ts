import { calculateGoertzelEnergy } from "../utils.js";
import { Detector } from "./types.js";

enum DetectionState {
  IDLE,
  FIRST_PAIR,
  SILENCE,
  SECOND_PAIR,
}

const QC1_TONE_MAP: Record<string, Record<string, number>> = {
  "a": {
    "d": 398.1,
    "e": 441.6,
    "f": 489.8,
    "g": 543.3,
    "h": 602.6,
    "j": 668.3,
    "k": 741.3,
    "l": 822.2,
    "m": 912.0,
    "c": 358.9,
    "n": 1011.6,
    "p": 1122.1
  },
  "b": {
    "d": 412.1,
    "e": 457.1,
    "f": 507.0,
    "g": 562.3,
    "h": 623.7,
    "j": 691.8,
    "k": 767.4,
    "l": 851.1,
    "m": 944.1,
    "c": 371.5,
    "n": 1047.1,
    "p": 116.4
  },
  "z": {
    "d": 384.6,
    "e": 426.6,
    "f": 473.2,
    "g": 524.8,
    "h": 582.1,
    "j": 645.7,
    "k": 716.7,
    "l": 794.3,
    "m": 881.0,
    "c": 346.7,
    "n": 977.2,
    "p": 1084.0
  }
};

export class MotorlaQCIDetector extends Detector {
  private _detectionState: DetectionState = DetectionState.IDLE;
  private _firstPairDetections = 0;
  private _processedSamples = 0;
  // The # of processed samples which the silence period starts
  private _silenceSampleStart = 0;
  // The # of processed samples which the second pair starts
  private _secondPairSampleStart = 0;
  private readonly _firstPairToneA: number;
  private readonly _firstPairToneB: number;
  private readonly _secondPairToneA: number;
  private readonly _secondPairToneB: number;

  constructor(
    toneSeries: string,
    firstPairToneA: string,
    firstPairToneB: string,
    secondPairToneA: string,
    secondPairToneB: string
  ) {
    super();
    toneSeries = toneSeries.toLowerCase();
    if (toneSeries !== 'a' && toneSeries !== 'b' && toneSeries !== 'z') {
      throw new Error(`Invalid tone series: ${toneSeries}`);
    }
    this._firstPairToneA = this.mapToneStringToFrequency(toneSeries, firstPairToneA);
    this._firstPairToneB = this.mapToneStringToFrequency(toneSeries, firstPairToneB);
    this._secondPairToneA = this.mapToneStringToFrequency(toneSeries, secondPairToneA);
    this._secondPairToneB = this.mapToneStringToFrequency(toneSeries, secondPairToneB);
  }

  private mapToneStringToFrequency(
    toneSeries: string,
    tone: string
  ): number {
    tone = tone.toLowerCase();
    const frequency = QC1_TONE_MAP[toneSeries][tone];
    if (!frequency) {
      throw new Error(`Invalid tone: ${tone}`);
    }
    return frequency;
  }

  private detectTonePair(
    floatSamples: Float32Array,
    sampleRate: number,
    toneA: number,
    toneB: number
  ): { toneAEnergy: number; toneBEnergy: number; pairDetected: boolean } {
    const toneAEnergy = calculateGoertzelEnergy(floatSamples, toneA, sampleRate);
    const toneBEnergy = calculateGoertzelEnergy(floatSamples, toneB, sampleRate);

    const threshold = 50.0;
    // For QCI, both tones must be present simultaneously
    const pairDetected = toneAEnergy >= threshold && toneBEnergy >= threshold;

    return { toneAEnergy, toneBEnergy, pairDetected };
  }

  private isSilence(energyLevels: number[]): boolean {
    const silenceThreshold = 10.0; // Lower threshold for considering something as silence
    return energyLevels.every(energy => energy < silenceThreshold);
  }

  private handleIdleState(firstPairDetected: boolean): void {
    if (firstPairDetected) {
      this._firstPairDetections++;
      if (this._firstPairDetections >= 3) {
        this._detectionState = DetectionState.FIRST_PAIR;
        this.emit('debug', 'First tone pair started');
      }
    } else {
      this._firstPairDetections = 0;
      this._processedSamples = 0;
    }
  }

  private handleFirstPairState(firstPairDetected: boolean, processingTime: number): void {
    if (!firstPairDetected) {
      if (processingTime >= 0.9) { // If we've had enough of first pair, move to silence
        this._detectionState = DetectionState.SILENCE;
        this._silenceSampleStart = this._processedSamples;
        this.emit('debug', `First pair complete after ${processingTime}s, entering silence period`);
      } else {
        this._detectionState = DetectionState.IDLE;
        this.emit('debug', 'Lost first pair prematurely - resetting');
      }
    } else if (processingTime >= 1.4) { // Longer than 1.2s + some tolerance
      this._detectionState = DetectionState.IDLE;
      this.emit('debug', 'First pair exceeded duration - resetting');
    }
  }

  private handleSilenceState(anyToneDetected: boolean, silenceTime: number, allEnergies: number[]): void {
    const hasSilence = this.isSilence(allEnergies);
    
    if (silenceTime >= 0.12) { // Silence period complete
      if (anyToneDetected) {
        this._detectionState = DetectionState.SECOND_PAIR;
        this._secondPairSampleStart = this._processedSamples;
        this.emit('debug', 'Entering second pair state');
      } else {
        this._detectionState = DetectionState.IDLE;
        this.emit('debug', 'No second pair detected after silence - resetting');
      }
    } else if (!hasSilence) { // Check for actual silence
      this._detectionState = DetectionState.IDLE;
      this.emit('debug', `No true silence detected during silence period - resetting after ${silenceTime}s`);
    }
  }

  private handleSecondPairState(secondPairDetected: boolean, secondPairTime: number): void {
    if (secondPairDetected && secondPairTime >= 0.8) {
      this._detectionState = DetectionState.IDLE;
      this.emit('detection', undefined);
      this.emit('debug', `Detection complete!`);
    } else if (!secondPairDetected) {
      this._detectionState = DetectionState.IDLE;
      this.emit('debug', 'Second pair lost prematurely');
    }
  }

  processAudioBlock(floatSamples: Float32Array, sampleRate: number): void {
    const firstPairResult = this.detectTonePair(
      floatSamples,
      sampleRate,
      this._firstPairToneA,
      this._firstPairToneB
    );

    const secondPairResult = this.detectTonePair(
      floatSamples,
      sampleRate,
      this._secondPairToneA,
      this._secondPairToneB
    );

    const allEnergies = [
      firstPairResult.toneAEnergy,
      firstPairResult.toneBEnergy,
      secondPairResult.toneAEnergy,
      secondPairResult.toneBEnergy
    ];

    if (this._detectionState !== DetectionState.IDLE) {
      this._processedSamples += floatSamples.length;
      this.emit('debug', `Energy levels - Pair1: ${firstPairResult.toneAEnergy.toFixed(4)}/${firstPairResult.toneBEnergy.toFixed(4)} Pair2: ${secondPairResult.toneAEnergy.toFixed(4)}/${secondPairResult.toneBEnergy.toFixed(4)}`);
    }

    const anyToneDetected = firstPairResult.pairDetected || secondPairResult.pairDetected;

    switch (this._detectionState) {
      case DetectionState.IDLE:
        this.handleIdleState(firstPairResult.pairDetected);
        break;

      case DetectionState.FIRST_PAIR:
        this.handleFirstPairState(firstPairResult.pairDetected, this._processedSamples / sampleRate);
        break;

      case DetectionState.SILENCE:
        this.handleSilenceState(anyToneDetected, (this._processedSamples - this._silenceSampleStart) / sampleRate, allEnergies);
        break;

      case DetectionState.SECOND_PAIR:
        this.handleSecondPairState(secondPairResult.pairDetected, (this._processedSamples - this._secondPairSampleStart) / sampleRate);
        break;
    }
  }
}