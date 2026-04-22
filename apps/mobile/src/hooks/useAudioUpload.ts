import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import type { Recording } from 'expo-av/build/Audio/Recording';
import { api } from '../lib/api';

export interface AudioUploadResult {
  messageId: string;
  key: string;
  playbackUrl: string;
  audioDurationS: number;
}

interface PresignedUploadResponse {
  messageId: string;
  key: string;
  uploadUrl: string;
  playbackUrl: string;
  durationS: number | null;
  expiresInSeconds: number;
}

export interface UseAudioUploadReturn {
  isRecording: boolean;
  recordingDurationMs: number;
  isUploading: boolean;
  uploadProgress: number;      // 0.0 → 1.0
  error: string | null;
  startRecording: () => Promise<void>;
  stopAndUpload: (sessionId: string, isDreamSubmission?: boolean) => Promise<AudioUploadResult | null>;
  cancelRecording: () => Promise<void>;
}

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  android: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
    extension: '.m4a',
  },
  ios: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
    extension: '.m4a',
  },
};

export function useAudioUpload(): UseAudioUploadReturn {
  const recordingRef = useRef<Recording | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone permission denied');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();

      recordingRef.current = recording;
      startTimeRef.current = Date.now();
      setRecordingDurationMs(0);
      setIsRecording(true);

      // Tick duration every 100ms for the UI timer
      durationIntervalRef.current = setInterval(() => {
        setRecordingDurationMs(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? 'Failed to start recording');
    }
  }, []);

  const stopAndUpload = useCallback(
    async (sessionId: string, isDreamSubmission = false): Promise<AudioUploadResult | null> => {
      if (!recordingRef.current || !isRecording) return null;

      // Clear duration ticker
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      setIsRecording(false);
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        // 1. Stop recording and get local URI
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;

        if (!uri) throw new Error('Recording produced no file');

        const audioDurationS = Math.max(1, Math.round(recordingDurationMs / 1000));

        // Reset audio mode so playback works normally after recording
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

        // 2. Get presigned S3 PUT URL from backend
        const presigned = await api.post<PresignedUploadResponse>('/v1/audio/presigned-upload', {
          sessionId,
          contentType: 'audio/m4a',
          durationS: audioDurationS,
        });

        setUploadProgress(0.1);

        // 3. PUT audio bytes directly to S3 via presigned URL
        //    Using XMLHttpRequest for upload progress events — fetch() does not
        //    expose upload progress in React Native.
        await uploadToS3(presigned.uploadUrl, uri, (progress) => {
          setUploadProgress(0.1 + progress * 0.85); // 10% → 95%
        });

        setUploadProgress(1);

        return {
          messageId: presigned.messageId,
          key: presigned.key,
          playbackUrl: presigned.playbackUrl,
          audioDurationS,
        };
      } catch (err: unknown) {
        const e = err as { message?: string };
        setError(e.message ?? 'Upload failed');
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [isRecording, recordingDurationMs],
  );

  const cancelRecording = useCallback(async () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {
        // Best-effort — recording may already be stopped
      }
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setIsRecording(false);
    setRecordingDurationMs(0);
    setError(null);
  }, []);

  return {
    isRecording,
    recordingDurationMs,
    isUploading,
    uploadProgress,
    error,
    startRecording,
    stopAndUpload,
    cancelRecording,
  };
}

// ── XHR upload helper ─────────────────────────────────────────────────────────

function uploadToS3(
  presignedUrl: string,
  fileUri: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('S3 upload network error'));
    xhr.ontimeout = () => reject(new Error('S3 upload timed out'));

    xhr.open('PUT', presignedUrl, true);
    xhr.setRequestHeader('Content-Type', 'audio/m4a');
    xhr.timeout = 120_000; // 2 min max upload time

    // React Native XHR supports { uri } blobs directly
    xhr.send({ uri: fileUri } as unknown as Document);
  });
}
