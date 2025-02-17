import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DetectionService } from '../DetectionService.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseDTMFAudioPath = join(__dirname, '..', '..', 'src', 'tests', 'audio', 'dtmf');

const filesToSequence = [
  {
    fileName: 'dtmf-1.wav',
    file: join(baseDTMFAudioPath, 'dtmf-1.wav'),
    sequence: '*123#'
  },
  {
    fileName: 'dtmf-2.wav',
    file: join(baseDTMFAudioPath, 'dtmf-2.wav'),
    sequence: '#9876'
  },
];

// Long timeout since we're processing real audio files
const TEST_TIMEOUT = 10000;

describe('DTMF Detection', () => {
  it.each(filesToSequence)('should detect DTMF sequence $sequence in $fileName', async ({ file, sequence }) => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Detection timed out'));
      }, TEST_TIMEOUT);

      const detectionService = new DetectionService([{
        type: 'DTMF',
        sequence
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