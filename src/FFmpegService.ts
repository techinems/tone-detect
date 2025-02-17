import Emittery from 'emittery';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';

export interface BroadCastifyStream {
  url: string;
  username: string;
  password: string;
}

export interface FFmpegEvents {
  debug: string;
  error: Error;
  end: void;
  samples: Float32Array;
}

export class FFmpegService extends Emittery<FFmpegEvents> {
  private ffmpegProcess?: ffmpeg.FfmpegCommand;
  private maxBufferSize = 1024 * 1024; // 1MB maximum buffer size
  private totalSamples = 0;

  constructor(private readonly sampleRate: number) {
    super();
  }

  startStream(input: string | BroadCastifyStream): PassThrough {
    this.stopStream(); // Stop any existing process
    this.totalSamples = 0;

    // If it's a broadcastify stream, extract the URL and headers
    let authString = '';
    if (typeof input === 'object') {
      const { url, username, password } = input;
      authString = Buffer.from(`${username}:${password}`).toString('base64');
      input = url;
    }

    const audioStream = new PassThrough();
    let buffer = Buffer.alloc(0);

    // Configure FFmpeg processing pipeline
    this.ffmpegProcess = ffmpeg(input)
      .inputOptions('-re'); // Read input at native frame rate (for live streams)

    // Add HTTP headers if necessary to auth broadcastify stream
    if (authString) {
      this.ffmpegProcess.inputOption('-headers', `Authorization: Basic ${authString}\r\n`);
    }

    this.ffmpegProcess
      .audioChannels(1) // Convert to mono
      .audioFrequency(this.sampleRate) // Resample to target rate
      .format('f32le'); // Output 32-bit float little-endian PCM

    this.ffmpegProcess
      .on('start', (commandLine) => {
        this.emit('debug', `FFmpeg started with command: ${commandLine}`);
      })
      .on('error', (err) => {
        this.emit('error', err);
      })
      .on('end', () => {
        this.emit('end', undefined);
      });

    this.ffmpegProcess.pipe(audioStream, { end: true });

    // Process incoming audio data
    audioStream.on('data', (chunk: Buffer) => {
      // Check if adding this chunk would exceed our maximum buffer size
      if (buffer.length + chunk.length > this.maxBufferSize) {
        // If we're falling behind, drop old data
        const bytesToDrop = (buffer.length + chunk.length) - this.maxBufferSize;
        buffer = buffer.subarray(bytesToDrop);
        this.emit('debug', `Buffer overflow - dropped ${bytesToDrop} bytes of old data`);
      }

      buffer = Buffer.concat([buffer, chunk]);
      
      // Convert buffer to float samples and emit
      const floatSamples = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
      this.totalSamples += floatSamples.length;
      this.emit('samples', floatSamples);
      
      // Clear the buffer after processing
      buffer = Buffer.alloc(0);
    });

    return audioStream;
  }

  stopStream(): void {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGKILL');
      this.ffmpegProcess = undefined;
      this.totalSamples = 0;
    }
  }
}