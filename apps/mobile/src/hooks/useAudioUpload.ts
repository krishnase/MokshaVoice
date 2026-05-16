import { useState, useRef, useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { Audio } from 'expo-av';
import type { Recording } from 'expo-av/build/Audio/Recording';
import { api } from '../lib/api';
import { stopActiveAudio } from './useAudioPlayer';

export interface AudioUploadResult {
  messageId: string;
  key: string;
  playbackUrl: string;
  audioDurationS: number;
}

export interface PendingRecording {
  uri: string;
  durationS: number;
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
  uploadProgress: number;
  error: string | null;
  pendingRecording: PendingRecording | null;
  startRecording: () => Promise<void>;
  stopAndPreview: () => Promise<void>;
  discardPending: () => void;
  uploadPending: (sessionId: string, isDreamSubmission?: boolean) => Promise<AudioUploadResult | null>;
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
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null);

  useEffect(() => {
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
    return () => {
      Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;
    if (AppState.currentState !== 'active') return;
    setError(null);
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone permission denied');
        return;
      }

      await stopActiveAudio();

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

      durationIntervalRef.current = setInterval(() => {
        setRecordingDurationMs(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err: unknown) {
      const e = err as { message?: string };
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch {}
      setError(e.message ?? 'Failed to start recording');
    }
  }, []);

  const stopAndPreview = useCallback(async () => {
    if (!recordingRef.current || !isRecording) return;

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    setIsRecording(false);
    const durationS = Math.max(1, Math.round(recordingDurationMs / 1000));

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (uri) {
        setPendingRecording({ uri, durationS });
      }
    } catch (err: unknown) {
      recordingRef.current = null;
      const e = err as { message?: string };
      setError(e.message ?? 'Failed to stop recording');
    }
  }, [isRecording, recordingDurationMs]);

  const discardPending = useCallback(() => {
    setPendingRecording(null);
    setError(null);
  }, []);

  const uploadPending = useCallback(
    async (sessionId: string, isDreamSubmission = false): Promise<AudioUploadResult | null> => {
      if (!pendingRecording) return null;

      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      const { uri, durationS } = pendingRecording;
      setPendingRecording(null);

      try {
        const presigned = await api.post<PresignedUploadResponse>('/v1/audio/presigned-upload', {
          sessionId,
          contentType: 'audio/m4a',
          durationS,
        });

        setUploadProgress(0.1);

        await uploadToS3(presigned.uploadUrl, uri, (progress) => {
          setUploadProgress(0.1 + progress * 0.85);
        });

        setUploadProgress(1);

        return {
          messageId: presigned.messageId,
          key: presigned.key,
          playbackUrl: presigned.playbackUrl,
          audioDurationS: durationS,
        };
      } catch (err: unknown) {
        const e = err as { message?: string };
        setError(e.message ?? 'Upload failed');
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [pendingRecording],
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
        // Best-effort
      }
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setIsRecording(false);
    setRecordingDurationMs(0);
    setPendingRecording(null);
    setError(null);
  }, []);

  return {
    isRecording,
    recordingDurationMs,
    isUploading,
    uploadProgress,
    error,
    pendingRecording,
    startRecording,
    stopAndPreview,
    discardPending,
    uploadPending,
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
    xhr.timeout = 120_000;

    xhr.send({ uri: fileUri } as unknown as Document);
  });
}
