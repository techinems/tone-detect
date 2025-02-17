import { describe, it, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DetectionService } from '../DetectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseQC1AudioPath = join(__dirname, '..', 'tests', 'audio', 'qc1');


const filesToTest = [
  {
    fileName: 'dphk-Z.wav',
    file: join(baseQC1AudioPath, 'dphk-Z.wav'),
    series: 'z',
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
    fileName: 'fkhm-Z.wav',
    file: join(baseQC1AudioPath, 'fkhm-Z.wav'),
    series: 'z',
    firstPair: {
      toneA: 'f',
      toneB: 'k',
    },
    secondPair: {
      toneA: 'h',
      toneB: 'm'
    }
  },
  {
    fileName: 'lphk-Z.wav',
    file: join(baseQC1AudioPath, 'lphk-Z.wav'),
    series: 'z',
    firstPair: {
      toneA: 'l',
      toneB: 'p',
    },
    secondPair: {
      toneA: 'h',
      toneB: 'k'
    }
  }
];

// Long timeout since we're processing real audio files
const TEST_TIMEOUT = 10000;

describe('QC1 Detection', () => {
  it.each(filesToTest)('should detect QC1 tones in $fileName', async ({ file, series, firstPair, secondPair }) => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Detection timed out'));
      }, TEST_TIMEOUT);

      const detectionService = new DetectionService([{
        type: 'QCI',
        toneSeries: series as ('A' | 'B' | 'Z'),
        firstPair,
        secondPair
      }]);

      detectionService.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      detectionService.on('detection', ({ configIndex }) => {
        clearTimeout(timeout);
        detectionService.stopDetection();
        resolve();
      });

      detectionService.startDetection(file);
    });
  });
});
