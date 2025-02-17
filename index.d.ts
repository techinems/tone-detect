/**
 * Configuration for Motorola QCII two-tone detection
 */
export interface QCIIDetectionConfig {
    /** Type identifier for QCII detection */
    type: 'QCII';
    /** First tone frequency in Hz */
    toneA: number;
    /** Second tone frequency in Hz */
    toneB: number;
}

/**
 * Configuration for Motorola QCI two-tone detection
 */
export interface QCIDetectionConfig {
    /** Type identifier for QCI detection */
    type: 'QCI';
    /** The tone series to use (A, B, or Z) */
    toneSeries: 'A' | 'B' | 'Z';
    /** First pair of tones */
    firstPair: {
        /** First tone letter code */
        toneA: string;
        /** Second tone letter code */
        toneB: string;
    };
    /** Second pair of tones */
    secondPair: {
        /** First tone letter code */
        toneA: string;
        /** Second tone letter code */
        toneB: string;
    };
}

/**
 * Configuration for DTMF sequence detection
 */
export interface DTMFDetectionConfig {
    /** Type identifier for DTMF detection */
    type: 'DTMF';
    /** DTMF sequence to detect (0-9, *, #, A-D) */
    sequence: string;
}

/**
 * Configuration for a Broadcastify stream input
 */
export interface BroadCastifyStream {
    /** The URL of the Broadcastify stream */
    url: string;
    /** Username for authentication */
    username: string;
    /** Password for authentication */
    password: string;
}

/** Union type of all possible detection configurations */
export type DetectionConfig = QCIIDetectionConfig | QCIDetectionConfig | DTMFDetectionConfig;

/**
 * Events emitted by the DetectionService
 */
export interface DetectionEvents {
    /** 
     * Emitted when a configured tone sequence is detected 
     * Includes the index of the configuration that triggered the detection
     */
    detection: { configIndex: number };
    /** Debug information about the detection process */
    debug: string;
    /** Emitted when an error occurs during detection */
    error: Error;
}

/**
 * Service for detecting various tone sequences in audio streams.
 * Supports Motorola QCI, QCII, and DTMF tone detection.
 */
export declare class DetectionService {
    /**
     * Creates a new DetectionService instance
     * @param detectionConfigs Array of configurations specifying the types of detection to perform
     */
    constructor(detectionConfigs: DetectionConfig[]);

    /**
     * Start tone detection on the specified input
     * @param input FFmpeg-compatible input (file path, URL, or device name) or a Broadcastify stream configuration
     */
    startDetection(input: string | BroadCastifyStream): void;

    /** Stop tone detection and clean up resources */
    stopDetection(): void;

    /**
     * Add an event listener
     * @param eventName Name of the event to listen for
     * @param listener Callback function to handle the event
     */
    on<K extends keyof DetectionEvents>(
        eventName: K,
        listener: (value: DetectionEvents[K]) => void | Promise<void>
    ): void;

    /**
     * Remove an event listener
     * @param eventName Name of the event to stop listening for
     * @param listener The callback function to remove
     */
    off<K extends keyof DetectionEvents>(
        eventName: K,
        listener: (value: DetectionEvents[K]) => void | Promise<void>
    ): void;
}