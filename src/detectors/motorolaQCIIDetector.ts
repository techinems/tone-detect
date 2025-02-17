
import { calculateGoertzelEnergy } from "../utils.js";
import { Detector } from "./types.js";

enum DetectionState {
  IDLE,
  FIRST_TONE,
  SECOND_TONE,
}


export class MotorolaQCIIDetector extends Detector {
  private _detectionState: DetectionState = DetectionState.IDLE;
  private _firstToneDetections = 0;
  // The number of samples processed during the detection state machine, resets at the end of detection
  private _processedSamples = 0;

  constructor(private readonly _toneA: number, private readonly _toneB: number) {
    super();
  }

  /** Calculate frequency energies and determine which tone is detected */
  private detectTones(floatSamples: Float32Array, sampleRate: number): { freq1Detected: boolean; freq2Detected: boolean; energy1: number; energy2: number } {
    const energy1 = calculateGoertzelEnergy(floatSamples, this._toneA, sampleRate);
    const energy2 = calculateGoertzelEnergy(floatSamples, this._toneB, sampleRate);

    const threshold = 50.0;
    const freq1Detected = energy1 >= threshold && energy1 > energy2;
    const freq2Detected = energy2 >= threshold && energy2 > energy1;

    return { freq1Detected, freq2Detected, energy1, energy2 };
  }

  /**
   * Handles the logic for the when the state machine is in the idle state
   * @param freq1Detected Whether or not frequency 1 (Tone A) was detected
   * @param freq2Detected Whether or not frequency 2 (Tone B) waas detected
   */
  private handleIdleState(freq1Detected: boolean, freq2Detected: boolean): void {
    if (freq1Detected && !freq2Detected) {
      this._firstToneDetections++;
      if (this._firstToneDetections >= 3) {
        this._detectionState = DetectionState.FIRST_TONE;
        this.emit('debug', `First tone started`);
      }
    } else {
      this._firstToneDetections = 0;
      this._processedSamples = 0;
    }
  }

  /**
   * Handles the logic for when the state machine is in the first tone state
   * @param freq1Detected Whether or not frequency 1 (Tone A) was detected
   * @param freq2Detected Whether or not frequency 2 (Tone B) waas detected
   * @param processingTime The amount of time in seconds that has passed since the start of the detection
   */
  private handleFirstToneState(freq1Detected: boolean, freq2Detected: boolean, processingTime: number): void {
    if (!freq1Detected && !freq2Detected) {
      this._firstToneDetections = 0;
      this._detectionState = DetectionState.IDLE;
      this.emit('debug', `Lost both tones - resetting`);
    } else if (!freq1Detected && freq2Detected && processingTime >= 0.9) {
      // If it has been at least 900 ms (out of the spec driven 1s) since the first tone was detected, we can assume that the second tone is valid
      this._detectionState = DetectionState.SECOND_TONE;
      this.emit('debug', `Transitioning to second tone after ${processingTime}s`);
    } else if (freq1Detected && processingTime >= 1.2) {
      // 1.2 seconds out of the expected (2s) is too long, resetting
      this._detectionState = DetectionState.IDLE;
      this.emit('debug', `First tone exceeded duration - resetting`);
    }
  }

  /**
   * Handles the logic for when the state machine is in the second tone state
   * @param freq2Detected Whether or not frequency 2 (Tone B) was detected
   * @param processingTime The amount of time in seconds that has passed since the start of the detection
   */
  private handleSecondToneState(freq2Detected: boolean, processingTime: number): void {
    if (freq2Detected && processingTime >= 3.2) {
      // 3.2 seconds needed to consider this a successful detection because 1s of the first tone and 2s of the second tone (spec says 1 and 3)
        this._detectionState = DetectionState.IDLE;
        // Successfully detected the second tone which means the detection is complete, we reset and emit the event
        this.emit('detection', undefined);
        this.emit('debug', `Detection complete after ${processingTime}s of audio`);
    } else if (!freq2Detected) {
      this._detectionState = DetectionState.IDLE;
      this.emit('debug', `Second tone lost prematurely`);
    }
  }

  processAudioBlock(floatSamples: Float32Array, sampleRate: number): void {
    const { freq1Detected, freq2Detected, energy1, energy2 } = this.detectTones(floatSamples, sampleRate);

    if (this._detectionState !== DetectionState.IDLE) {
      this._processedSamples += floatSamples.length;
      if (freq1Detected && !freq2Detected) {
        this.emit('debug', `Energy levels - Tone1: ${energy1.toFixed(4)}`);
      } else {
        this.emit('debug', `Energy levels - Tone2: ${energy2.toFixed(4)}`);
      }
    }

    const processingTime = this._processedSamples / sampleRate;

    switch (this._detectionState) {
      case DetectionState.IDLE:
        this.handleIdleState(freq1Detected, freq2Detected);
        break;

      case DetectionState.FIRST_TONE:
        this.handleFirstToneState(freq1Detected, freq2Detected, this._processedSamples / sampleRate);
        break;

      case DetectionState.SECOND_TONE:
        this.handleSecondToneState(freq2Detected, this._processedSamples / sampleRate);
        break;
    }
  }
}


