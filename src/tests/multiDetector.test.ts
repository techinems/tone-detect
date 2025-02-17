import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DetectionService, DetectionConfig } from '../DetectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define paths to test audio files
const dtmfAudioPath = join(__dirname, '..', 'tests', 'audio', 'dtmf', 'dtmf-1.wav');
const qc1AudioPath = join(__dirname, '..', 'tests', 'audio', 'qc1', 'dphk-Z.wav');
const qc2AudioPath = join(__dirname, '..', 'tests', 'audio', 'qc2', '057-175.wav');

const TEST_TIMEOUT = 10000; // Increased to 30 seconds to accommodate all three detections

describe('Multi Detector Tests', () => {
  it('should detect all three types of tones simultaneously', async () => {
    const detectionConfigs: DetectionConfig[] = [
      {
        type: 'DTMF',
        sequence: '*123#'
      },
      {
        type: 'QCI',
        toneSeries: 'Z',
        firstPair: {
          toneA: 'd',
          toneB: 'p',
        },
        secondPair: {
          toneA: 'h',
          toneB: 'k'
        }
      },
      {
        type: 'QCII',
        toneA: 569.1,
        toneB: 1687.2
      }
    ];

    const detectionsPromise = (file: string) => {
      return new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => {
          detectionService.stopDetection();
          reject(new Error('Detection timed out'));
        }, TEST_TIMEOUT);

        const detectionService = new DetectionService(detectionConfigs);

        detectionService.on('error', (error) => {
          clearTimeout(timeout);
          detectionService.stopDetection();
          reject(error);
        });

        detectionService.on('detection', ({ configIndex }) => {
          clearTimeout(timeout);
          detectionService.stopDetection();
          resolve(configIndex);
        });

        detectionService.startDetection(file);
      });
    };

    // Test each file and expect the correct detection index
    const dtmfResult = await detectionsPromise(dtmfAudioPath);
    expect(dtmfResult).toBe(0); // DTMF config is at index 0

    const qc1Result = await detectionsPromise(qc1AudioPath);
    expect(qc1Result).toBe(1); // QCI config is at index 1

    const qc2Result = await detectionsPromise(qc2AudioPath);
    expect(qc2Result).toBe(2); // QCII config is at index 2
  });
});