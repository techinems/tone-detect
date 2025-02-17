import { describe, it, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DetectionService } from '../DetectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseQC2AudioPath = join(__dirname, '..', 'tests', 'audio', 'qc2');


const filesToTest = [
  {
    fileName: '057-175.wav',
    file: join(baseQC2AudioPath, '057-175.wav'),
    toneA: 569.1,
    toneB: 1687.2
  },
  {
    fileName: '064-085.wav',
    file: join(baseQC2AudioPath, '064-085.wav'),
    toneA: 832.5,
    toneB: 1880
  },
  {
    fileName: '068-072.wav',
    file: join(baseQC2AudioPath, '068-072.wav'),
    toneA: 1020,
    toneB: 1201
  },
  {
    fileName: '095-111.wav',
    file: join(baseQC2AudioPath, '095-111.wav'),
    toneA: 2537,
    toneB: 349
  },
  {
    fileName: '096-160.wav',
    file: join(baseQC2AudioPath, '096-160.wav'),
    toneA: 2615,
    toneB: 953.7
  },
  {
    fileName: "105-170.wav",
    file: join(baseQC2AudioPath, "105-170.wav"),
    toneA: 3265,
    toneB: 1472.9
  }
];

// Long timeout since we're processing real audio files
const TEST_TIMEOUT = 10000;

describe('QC2 Detection', () => {
  it.each(filesToTest)('should detect QC2 tones $toneA Hz and $toneB Hz in $fileName', async ({ file, toneA, toneB }) => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        detectionService.stopDetection();
        reject(new Error('Detection timed out'));
      }, TEST_TIMEOUT);

      const detectionService = new DetectionService([{
        type: 'QCII',
        toneA,
        toneB
      }]);

      detectionService.on('error', (error) => {
        clearTimeout(timeout);
        detectionService.stopDetection();
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
