import { calculateGoertzelEnergy } from "../utils.js";
import { Detector } from "./types.js";

// DTMF frequency pairs (row, column)
const DTMF_FREQUENCIES: Record<string, number[]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], 'A': [697, 1633],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477], 'B': [770, 1633],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], 'C': [852, 1633],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477], 'D': [941, 1633]
};

// All possible DTMF frequencies for checking silence
const ALL_DTMF_FREQUENCIES = Array.from(new Set(
  Object.values(DTMF_FREQUENCIES).flat()
));

enum DetectionState {
  IDLE,
  DETECTING_DIGIT,
  INTER_DIGIT_SILENCE
}

export class DTMFDetector extends Detector {
  private _detectionState: DetectionState = DetectionState.IDLE;
  private _sequence: string;
  private _currentIndex = 0;
  private _digitDetections = 0;
  private _processedSamples = 0;
  private _silenceStartSample = 0;
  private _consecutiveSilenceDetections = 0;

  constructor(sequence: string) {
    super();
    sequence = sequence.toUpperCase();
    // Validate sequence contains only valid DTMF digits
    if (!sequence.split('').every(digit => digit in DTMF_FREQUENCIES)) {
      throw new Error(`Invalid DTMF sequence: ${sequence}`);
    }
    this._sequence = sequence;
  }

  private detectCurrentDigit(floatSamples: Float32Array, sampleRate: number): { detected: boolean; energies: number[] } {
    const currentDigit = this._sequence[this._currentIndex];
    const [rowFreq, colFreq] = DTMF_FREQUENCIES[currentDigit];
    
    const rowEnergy = calculateGoertzelEnergy(floatSamples, rowFreq, sampleRate);
    const colEnergy = calculateGoertzelEnergy(floatSamples, colFreq, sampleRate);
    
    const threshold = 100.0;
    // Both frequencies must be present with sufficient energy and dominate  theirbands
    const detected = rowEnergy >= threshold && colEnergy >= threshold;

    return { detected, energies: [rowEnergy, colEnergy] };
  }

  private isSilence(floatSamples: Float32Array, sampleRate: number): boolean {
    const silenceThreshold = 20.0;
    
    // Check all DTMF frequencies to ensure true silence
    return ALL_DTMF_FREQUENCIES.every(freq => {
      const energy = calculateGoertzelEnergy(floatSamples, freq, sampleRate);
      return energy < silenceThreshold;
    });
  }

  private handleIdleState(digitDetected: boolean): void {
    if (digitDetected) {
      this._digitDetections++;
      if (this._digitDetections >= 2) { // Reduced from 3 to 2 for faster detection
        this._detectionState = DetectionState.DETECTING_DIGIT;
        this._processedSamples = 0; // Reset counter when starting digit detection
        this.emit('debug', `Started detecting digit ${this._sequence[this._currentIndex]}`);
      }
    } else {
      this._digitDetections = 0;
      this._processedSamples = 0;
    }
  }

  private handleDetectingDigitState(digitDetected: boolean, processingTime: number): void {
    if (!digitDetected) {
      if (processingTime >= 0.03) { // Reduced from 0.04 to 0.03 for faster detection
        this._detectionState = DetectionState.INTER_DIGIT_SILENCE;
        this._silenceStartSample = this._processedSamples;
        this._consecutiveSilenceDetections = 0;
        this._processedSamples = 0; // Reset counter when entering silence state
        this.emit('debug', `Digit ${this._sequence[this._currentIndex]} complete after ${processingTime}s`);
      } else {
        this._detectionState = DetectionState.IDLE;
        this._processedSamples = 0;
        this.emit('debug', 'Digit lost prematurely - resetting');
      }
    } else if (processingTime >= 0.15) { // Increased from 0.1 to 0.15 for more tolerance
      this._detectionState = DetectionState.IDLE;
      this._processedSamples = 0;
      this.emit('debug', 'Digit duration too long - resetting');
    }
  }

  private handleInterDigitSilenceState(hasSilence: boolean, silenceTime: number): void {
    if (hasSilence) {
      this._consecutiveSilenceDetections++;
    } else {
      this._consecutiveSilenceDetections = 0;
    }

    if (this._consecutiveSilenceDetections >= 2 && silenceTime >= 0.02) { // Reduced silence requirement
      // Move to next digit
      this._currentIndex++;
      if (this._currentIndex >= this._sequence.length) {
        // Successfully detected entire sequence
        this._detectionState = DetectionState.IDLE;
        this._currentIndex = 0;
        this._processedSamples = 0;
        this.emit('detection', undefined);
        this.emit('debug', 'Sequence detection complete!');
      } else {
        // Move to detecting next digit
        this._detectionState = DetectionState.IDLE;
        this._digitDetections = 0;
        this._processedSamples = 0;
        this.emit('debug', `Ready for next digit ${this._sequence[this._currentIndex]}`);
      }
    } else if (!hasSilence && silenceTime >= 0.1) { // Added timeout for silence detection
      this._detectionState = DetectionState.IDLE;
      this._processedSamples = 0;
      this.emit('debug', 'Lost silence between digits - resetting');
    }
  }

  processAudioBlock(floatSamples: Float32Array, sampleRate: number): void {
    const { detected: digitDetected, energies } = this.detectCurrentDigit(floatSamples, sampleRate);

    if (this._detectionState !== DetectionState.IDLE) {
      this._processedSamples += floatSamples.length;
      const currentDigit = this._sequence[this._currentIndex];
      this.emit('debug', `Digit ${currentDigit} - Row: ${energies[0].toFixed(4)} Col: ${energies[1].toFixed(4)}`);
    }

    const processingTime = this._processedSamples / sampleRate;
    const silenceTime = (this._processedSamples - this._silenceStartSample) / sampleRate;
    const hasSilence = this.isSilence(floatSamples, sampleRate);

    switch (this._detectionState) {
      case DetectionState.IDLE:
        this.handleIdleState(digitDetected);
        break;

      case DetectionState.DETECTING_DIGIT:
        this.handleDetectingDigitState(digitDetected, processingTime);
        break;

      case DetectionState.INTER_DIGIT_SILENCE:
        this.handleInterDigitSilenceState(hasSilence, silenceTime);
        break;
    }
  }
}