import { useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import type { AVPlaybackStatus, Sound } from 'expo-av/build/Audio/Sound';
import * as FileSystem from 'expo-file-system';

export type PlaybackSpeed = 1 | 1.5 | 2;

export interface PlaybackState {
  currentMessageId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  speed: PlaybackSpeed;
  error: string | null;
}

export interface UseAudioPlayerReturn extends PlaybackState {
  play: (messageId: string, playbackUrl: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setSpeed: (speed: PlaybackSpeed) => Promise<void>;
  stop: () => Promise<void>;
}

const CACHE_DIR = `${FileSystem.cacheDirectory}mokshavoice/audio/`;

async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

function localPath(messageId: string): string {
  return `${CACHE_DIR}${messageId}.m4a`;
}

async function resolveLocalUri(messageId: string, playbackUrl: string): Promise<string> {
  await ensureCacheDir();
  const path = localPath(messageId);
  const info = await FileSystem.getInfoAsync(path);

  if (info.exists) {
    // Already cached — play offline without hitting CloudFront
    return path;
  }

  // Download once; subsequent plays use the cached file
  const result = await FileSystem.downloadAsync(playbackUrl, path);
  if (result.status !== 200) {
    // Clean up partial download before throwing
    await FileSystem.deleteAsync(path, { idempotent: true });
    throw new Error(`Audio download failed (HTTP ${result.status})`);
  }

  return path;
}

// Module-level singleton so only one audio track plays across all chat bubbles
let _activeSound: Sound | null = null;
let _activeMessageId: string | null = null;

export function useAudioPlayer(): UseAudioPlayerReturn {
  const soundRef = useRef<Sound | null>(null);
  const [state, setState] = useState<PlaybackState>({
    currentMessageId: null,
    isPlaying: false,
    isLoading: false,
    positionMs: 0,
    durationMs: 0,
    speed: 1,
    error: null,
  });

  // Track the messageId this hook instance is responsible for
  const myMessageId = useRef<string | null>(null);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current && myMessageId.current === _activeMessageId) {
        soundRef.current.unloadAsync().catch(() => {});
        _activeSound = null;
        _activeMessageId = null;
      }
    };
  }, []);

  function onPlaybackStatusUpdate(status: AVPlaybackStatus) {
    if (!status.isLoaded) {
      if (status.error) {
        setState((s) => ({ ...s, error: `Playback error: ${status.error}`, isPlaying: false }));
      }
      return;
    }

    setState((s) => ({
      ...s,
      isPlaying: status.isPlaying,
      positionMs: status.positionMillis,
      durationMs: status.durationMillis ?? s.durationMs,
      isLoading: false,
      error: null,
    }));

    // Auto-reset position to start when track finishes
    if (status.didJustFinish) {
      setState((s) => ({ ...s, isPlaying: false, positionMs: 0 }));
    }
  }

  const play = useCallback(
    async (messageId: string, playbackUrl: string): Promise<void> => {
      setState((s) => ({ ...s, isLoading: true, error: null, currentMessageId: messageId }));
      myMessageId.current = messageId;

      try {
        // Stop whatever is currently playing globally
        if (_activeSound && _activeMessageId !== messageId) {
          await _activeSound.stopAsync().catch(() => {});
          await _activeSound.unloadAsync().catch(() => {});
          _activeSound = null;
          _activeMessageId = null;
        }

        // If same message is already loaded and paused, just resume
        if (_activeSound && _activeMessageId === messageId) {
          await _activeSound.playAsync();
          soundRef.current = _activeSound;
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          // Routes audio through the speaker, not the earpiece
          staysActiveInBackground: false,
        });

        // Resolve local cache (downloads if not yet cached)
        const localUri = await resolveLocalUri(messageId, playbackUrl);

        const { sound } = await Audio.Sound.createAsync(
          { uri: localUri },
          {
            shouldPlay: true,
            rate: state.speed,
            shouldCorrectPitch: true,
            pitchCorrectionQuality: Audio.PitchCorrectionQuality.High,
          },
          onPlaybackStatusUpdate,
        );

        soundRef.current = sound;
        _activeSound = sound;
        _activeMessageId = messageId;
      } catch (err: unknown) {
        const e = err as { message?: string };
        setState((s) => ({
          ...s,
          isLoading: false,
          isPlaying: false,
          error: e.message ?? 'Failed to play audio',
        }));
      }
    },
    [state.speed],
  );

  const pause = useCallback(async () => {
    await soundRef.current?.pauseAsync();
    setState((s) => ({ ...s, isPlaying: false }));
  }, []);

  const resume = useCallback(async () => {
    await soundRef.current?.playAsync();
    setState((s) => ({ ...s, isPlaying: true }));
  }, []);

  const seek = useCallback(async (positionMs: number) => {
    await soundRef.current?.setPositionAsync(positionMs);
    setState((s) => ({ ...s, positionMs }));
  }, []);

  const setSpeed = useCallback(
    async (speed: PlaybackSpeed) => {
      setState((s) => ({ ...s, speed }));
      if (soundRef.current) {
        await soundRef.current.setRateAsync(
          speed,
          true,
          Audio.PitchCorrectionQuality.High,
        );
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    if (_activeMessageId === myMessageId.current) {
      _activeSound = null;
      _activeMessageId = null;
    }
    setState((s) => ({
      ...s,
      isPlaying: false,
      positionMs: 0,
      currentMessageId: null,
    }));
  }, []);

  return { ...state, play, pause, resume, seek, setSpeed, stop };
}

// ── Utility: pre-warm cache for a list of messages ────────────────────────────
// Call this when a session chat screen loads to download audio in the background.
export async function prefetchAudio(
  messages: Array<{ messageId: string; playbackUrl: string }>,
): Promise<void> {
  await ensureCacheDir();
  for (const { messageId, playbackUrl } of messages) {
    const path = localPath(messageId);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      FileSystem.downloadAsync(playbackUrl, path).catch(() => {
        // Prefetch is best-effort — ignore failures
      });
    }
  }
}

// ── Utility: evict old cached files (call periodically or on low storage) ─────
export async function clearAudioCache(): Promise<void> {
  await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
}
