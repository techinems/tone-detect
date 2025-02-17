import Emittery from "emittery";

export interface DetectorEvents {
    detection: void;
    debug: string;
}

export interface IDetector extends Emittery<DetectorEvents> {
    processAudioBlock(floatSamples: Float32Array, sampleRate: number): void;
}

export abstract class Detector extends Emittery<DetectorEvents> implements IDetector {
    abstract processAudioBlock(floatSamples: Float32Array, sampleRate: number): void;
}