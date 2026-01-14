import React, { useState, useEffect, useCallback, useRef } from 'react';
import LayercodeClient, { type AgentConfig, type AuthorizeSessionRequest, type LayercodeAudioInputDevice, listAudioInputDevices, watchAudioInputDevices } from '@layercode/js-sdk';

/**
 * Configuration options for the useLayercodeAgent hook.
 */
interface UseLayercodeAgentOptions {
  agentId: string;
  conversationId?: string;
  authorizeSessionEndpoint: string;
  authorizeSessionRequest?: AuthorizeSessionRequest;
  metadata?: Record<string, any>;
  onConnect?: ({ conversationId, config }: { conversationId: string | null; config?: AgentConfig }) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onDataMessage?: (data: any) => void;
  onMuteStateChange?: (isMuted: boolean) => void;
  onMessage?: (data: any) => void;
  onUserSpeakingChange?: (isSpeaking: boolean) => void;
  onAgentSpeakingChange?: (isSpeaking: boolean) => void;

  audioInput?: boolean;
  audioOutput?: boolean;
  enableVAD?: boolean;
  onAudioInputChanged?: (audioInput: boolean) => void;
  onAudioOutputChanged?: (audioOutput: boolean) => void;
  enableAmplitudeMonitoring?: boolean;
  /**
   * When false, skips microphone device enumeration/watchers until audio input is enabled.
   * This prevents getUserMedia from being invoked before the user opts into voice mode.
   */
  autoLoadInputDevices?: boolean;
}

const normalizeDeviceId = (deviceId?: string | null): string | null => {
  if (!deviceId || deviceId === 'default') {
    return null;
  }
  return deviceId;
};

/**
 * Hook for connecting to a Layercode agent in a React application
 *
 * @param options - Configuration options for the agent
 * @returns An object containing methods and state for interacting with the agent
 */
const useLayercodeAgent = (
  // Accept the public options plus any other properties (for internal use)
  options: UseLayercodeAgentOptions & Record<string, any>
) => {
  // Extract public options
  const {
    agentId,
    conversationId,
    authorizeSessionEndpoint,
    authorizeSessionRequest,
    metadata = {},
    onConnect,
    onDisconnect,
    onError,
    onDataMessage,
    onMessage,
    onMuteStateChange,
    onUserSpeakingChange,
    onAgentSpeakingChange,
    onAudioInputChanged,
    onAudioOutputChanged,
  } = options;
  const websocketUrlOverride = options['_websocketUrl'];
  const enableAmplitudeMonitoring = options.enableAmplitudeMonitoring ?? true;
  const autoLoadInputDevices = options.autoLoadInputDevices ?? true;
  const enableVAD = options.enableVAD ?? true;

  const [status, setStatus] = useState('initializing');
  const [userAudioAmplitude, setUserAudioAmplitude] = useState(0);
  const [agentAudioAmplitude, setAgentAudioAmplitude] = useState(0);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [audioInput, _setAudioInput] = useState<boolean>(options.audioInput ?? true);
  const [audioOutput, _setAudioOutput] = useState<boolean>(options.audioOutput ?? true);
  const [isMuted, setIsMuted] = useState(false);
  const [internalConversationId, setInternalConversationId] = useState<string | null | undefined>(conversationId);
  const [availableInputDevices, setAvailableInputDevices] = useState<LayercodeAudioInputDevice[]>([]);
  const [activeInputDeviceId, setActiveInputDeviceId] = useState<string | null>(null);
  const [preferredInputDeviceId, setPreferredInputDeviceId] = useState<string | null>(null);
  const [isInputDeviceListLoading, setIsInputDeviceListLoading] = useState(false);
  const [inputDeviceListError, setInputDeviceListError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | undefined>(conversationId);
  const preferredInputDeviceRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  // Reference to the LayercodeClient instance
  const clientRef = useRef<LayercodeClient | null>(null);
  const shouldManageInputDevices = autoLoadInputDevices || audioInput;

  const refreshInputDevices = useCallback(async () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return [] as LayercodeAudioInputDevice[];
    }

    setIsInputDeviceListLoading(true);
    try {
      const devices = await listAudioInputDevices({ requestPermission: false });
      if (!mountedRef.current) {
        return devices;
      }
      setAvailableInputDevices(devices);
      setInputDeviceListError(null);

      if (!devices.length) {
        setActiveInputDeviceId(null);
        return devices;
      }

      if (preferredInputDeviceRef.current === null) {
        const defaultDevice = devices.find((device) => device.default) ?? devices[0];
        setActiveInputDeviceId(normalizeDeviceId(defaultDevice?.deviceId));
      }

      return devices;
    } catch (error) {
      if (mountedRef.current) {
        setInputDeviceListError(error instanceof Error ? error.message : 'Unable to access microphones');
      }
      throw error;
    } finally {
      if (mountedRef.current) {
        setIsInputDeviceListLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    conversationIdRef.current = conversationId;
    if (conversationId !== undefined) {
      setInternalConversationId(conversationId);
    } else {
      setInternalConversationId(undefined);
    }
  }, [conversationId]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enableAmplitudeMonitoring) {
      setUserAudioAmplitude(0);
      setAgentAudioAmplitude(0);
    }
  }, [enableAmplitudeMonitoring]);

  useEffect(() => {
    preferredInputDeviceRef.current = preferredInputDeviceId;
  }, [preferredInputDeviceId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !shouldManageInputDevices) {
      return;
    }

    refreshInputDevices().catch((error) => {
      console.warn('Layercode: failed to load microphone devices', error);
    });
  }, [refreshInputDevices, shouldManageInputDevices]);

  useEffect(() => {
    if (!shouldManageInputDevices || typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const unsubscribe = watchAudioInputDevices((devices) => {
      setAvailableInputDevices(devices);
      setInputDeviceListError(null);
      if (devices.length && preferredInputDeviceRef.current === null) {
        const defaultDevice = devices.find((device) => device.default) ?? devices[0];
        setActiveInputDeviceId(normalizeDeviceId(defaultDevice?.deviceId));
      } else if (!devices.length) {
        setActiveInputDeviceId(null);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [shouldManageInputDevices]);

  const createClient = useCallback(
    (initialConversationId: string | null) => {
      console.log('Creating LayercodeClient instance with audioInput:', audioInput, 'audioOutput:', audioOutput);
      const client = new LayercodeClient({
        agentId,
        conversationId: initialConversationId,
        authorizeSessionEndpoint,
        authorizeSessionRequest,
        metadata,
        audioInput,
        audioOutput,
        enableVAD,
        audioInputChanged: (next: boolean) => {
          _setAudioInput(next);
          onAudioInputChanged?.(next);
        },
        audioOutputChanged: (next: boolean) => {
          _setAudioOutput(next);
          onAudioOutputChanged?.(next);
        },
        onDeviceSwitched: (deviceId: string) => {
          const normalized = normalizeDeviceId(deviceId);
          setActiveInputDeviceId(normalized);
          if (preferredInputDeviceRef.current === null) {
            setPreferredInputDeviceId(normalized);
          }
        },
        onDevicesChanged: (devices: Array<MediaDeviceInfo & { default: boolean }>) => {
          setAvailableInputDevices(devices as LayercodeAudioInputDevice[]);
          setInputDeviceListError(null);
        },
        onConnect: ({ conversationId, config }: { conversationId: string | null; config?: AgentConfig }) => {
          setInternalConversationId((current) => {
            if (conversationIdRef.current === undefined) {
              return conversationId;
            }
            return conversationId ?? current ?? null;
          });
          onConnect?.({ conversationId, config });
        },
        onDisconnect: () => {
          onDisconnect?.();
        },
        onError: (error: Error) => {
          onError?.(error);
        },
        onDataMessage: (data: any) => {
          onDataMessage?.(data);
        },
        onMessage: (data: any) => {
          onMessage?.(data);
        },
        onStatusChange: (newStatus: string) => {
          setStatus(newStatus);
        },
        onUserAmplitudeChange: enableAmplitudeMonitoring
          ? (amplitude: number) => {
              setUserAudioAmplitude(amplitude);
            }
          : undefined,
        onAgentAmplitudeChange: enableAmplitudeMonitoring
          ? (amplitude: number) => {
              setAgentAudioAmplitude(amplitude);
            }
          : undefined,
        onUserIsSpeakingChange: (isSpeaking: boolean) => {
          setUserSpeaking(isSpeaking);
          onUserSpeakingChange?.(isSpeaking);
        },
        onAgentSpeakingChange: (isSpeaking: boolean) => {
          setAgentSpeaking(isSpeaking);
          onAgentSpeakingChange?.(isSpeaking);
        },
        onMuteStateChange: (muted: boolean) => {
          setIsMuted(muted);
          onMuteStateChange?.(muted);
        },
        enableAmplitudeMonitoring,
      });

      if (websocketUrlOverride) {
        client._websocketUrl = websocketUrlOverride;
      }

      setUserSpeaking(false);
      onUserSpeakingChange?.(false);
      setAgentSpeaking(false);
      onAgentSpeakingChange?.(false);
      setIsMuted(client.isMuted);
      clientRef.current = client;
      return client;
    },
    [
      agentId,
      authorizeSessionEndpoint,
      authorizeSessionRequest,
      metadata,
      onConnect,
      onDataMessage,
      onDisconnect,
      onError,
      onMessage,
      onMuteStateChange,
      onUserSpeakingChange,
      onAgentSpeakingChange,
      onAudioInputChanged,
      websocketUrlOverride,
      onAudioOutputChanged,
      audioInput,
      audioOutput,
      enableVAD,
      enableAmplitudeMonitoring,
    ]
  );

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, []);

  // Class methods
  const mute = useCallback(() => {
    if (!clientRef.current) {
      console.warn('[Layercode] mute() called but no client exists. Did you call connect() first?');
      return;
    }
    clientRef.current.mute();
  }, []);

  const unmute = useCallback(async () => {
    if (!clientRef.current) {
      console.warn('[Layercode] unmute() called but no client exists. Did you call connect() first?');
      return;
    }
    await clientRef.current.unmute();
  }, []);

  const setAudioInput = useCallback(
    async (state: React.SetStateAction<boolean>) => {
      _setAudioInput(state);
      const next = typeof state === 'function' ? (state as (prev: boolean) => boolean)(audioInput) : state;
      await clientRef.current?.setAudioInput(next);

      // After the mic is enabled (permission granted), refresh device labels without prompting again.
      if (next) {
        refreshInputDevices().catch((error) => {
          console.warn('Layercode: failed to refresh microphones after enabling audio input', error);
        });
      }
    },
    [_setAudioInput, clientRef, audioInput, refreshInputDevices, enableVAD]
  );

  const setAudioOutput = useCallback(
    async (state: React.SetStateAction<boolean>) => {
      _setAudioOutput(state);
      const next = typeof state === 'function' ? (state as (prev: boolean) => boolean)(audioOutput) : state;
      await clientRef.current?.setAudioOutput(next);
    },
    [_setAudioOutput, clientRef, audioOutput]
  );

  const selectInputDevice = useCallback(async (deviceId: string | null) => {
    const normalized = normalizeDeviceId(deviceId);
    setPreferredInputDeviceId(normalized);
    preferredInputDeviceRef.current = normalized;
    setInputDeviceListError(null);

    if (!clientRef.current) {
      return;
    }

    try {
      await clientRef.current.setPreferredInputDevice(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to switch microphone';
      setInputDeviceListError(message);
      throw error;
    }
  }, []);

  const triggerUserTurnStarted = useCallback(() => {
    clientRef.current?.triggerUserTurnStarted();
  }, []);
  const triggerUserTurnFinished = useCallback(() => {
    clientRef.current?.triggerUserTurnFinished();
  }, []);
  const sendClientResponseText = useCallback((text: string) => {
    clientRef.current?.sendClientResponseText(text);
  }, []);
  const sendClientResponseData = useCallback((text: string) => {
    clientRef.current?.sendClientResponseData(text);
  }, []);
  const connect = useCallback(async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.disconnect();
      } catch (error) {
        console.error('Failed to disconnect existing client before reconnect:', error);
      }
      clientRef.current = null;
    }

    const nextConversationId = conversationIdRef.current !== undefined ? conversationIdRef.current : internalConversationId ?? null;

    const client = createClient(nextConversationId ?? null);

    try {
      await client.setPreferredInputDevice(preferredInputDeviceRef.current);
      await client.connect();

      if (client.audioInputEnabled) {
        refreshInputDevices().catch((error) => {
          console.warn('Layercode: failed to refresh microphones after connect', error);
        });
      }
    } catch (error) {
      console.error('Failed to connect to agent:', error);
      onError?.(error as Error);
      throw error;
    }
  }, [createClient, internalConversationId, onError, refreshInputDevices]);
  const disconnect = useCallback(async () => {
    if (!clientRef.current) {
      console.warn('[Layercode] disconnect() called but no client exists');
      return;
    }

    const client = clientRef.current;
    clientRef.current = null;

    try {
      await client.disconnect();
    } catch (error) {
      console.error('Failed to disconnect from agent:', error);
      throw error;
    }
  }, []);

  // Return methods and state
  return {
    // Methods
    triggerUserTurnStarted,
    triggerUserTurnFinished,
    connect,
    disconnect,
    mute,
    unmute,
    sendClientResponseText,
    sendClientResponseData,

    setAudioInput,
    setAudioOutput,
    refreshInputDevices,
    selectInputDevice,

    // State
    status,
    userAudioAmplitude,
    agentAudioAmplitude,
    userSpeaking,
    agentSpeaking,
    isMuted,
    conversationId: internalConversationId,
    audioInput,
    audioOutput,
    enableVAD,
    availableInputDevices,
    activeInputDeviceId,
    preferredInputDeviceId,
    isInputDeviceListLoading,
    inputDeviceListError,
  };
};
type UseLayercodeAgentReturn = ReturnType<typeof useLayercodeAgent>;

type NativeSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>;

interface MicrophoneSelectProps extends NativeSelectProps {
  agent: UseLayercodeAgentReturn;
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  emptyLabel?: React.ReactNode;
  containerClassName?: string;
  autoRefresh?: boolean;
}

const MicrophoneSelect = ({
  agent,
  label = 'Microphone',
  helperText,
  emptyLabel = 'No microphones detected',
  containerClassName,
  className,
  autoRefresh = true,
  disabled,
  ...selectProps
}: LayercodeMicrophoneSelectProps) => {
  const selectId = React.useId();
  const { refreshInputDevices, selectInputDevice, availableInputDevices, isInputDeviceListLoading, inputDeviceListError, preferredInputDeviceId, activeInputDeviceId } = agent;

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    refreshInputDevices().catch((error) => {
      console.warn('Layercode: failed to refresh microphones', error);
    });
  }, [autoRefresh, refreshInputDevices]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    selectInputDevice(value === 'default' ? null : value);
  };

  const currentValue = preferredInputDeviceId ?? activeInputDeviceId ?? 'default';

  const hasDevices = availableInputDevices.length > 0;

  return (
    <div className={containerClassName}>
      {label ? (
        <label className="layercode-mic-select__label" htmlFor={selectId}>
          {label}
        </label>
      ) : null}

      <select
        id={selectId}
        className={className}
        value={currentValue}
        onChange={handleChange}
        disabled={disabled || isInputDeviceListLoading || (!hasDevices && !inputDeviceListError)}
        {...selectProps}
      >
        <option value="default">System default microphone</option>
        {availableInputDevices.map((device) => {
          const optionValue = device.deviceId || 'default';
          const labelText = device.label || (device.default ? 'System default microphone' : 'Microphone');
          const suffix = device.default && optionValue !== 'default' ? ' (default)' : '';
          return (
            <option key={`${device.deviceId}-${device.label}`} value={optionValue}>
              {labelText}
              {suffix}
            </option>
          );
        })}
      </select>

      {isInputDeviceListLoading ? <div className="layercode-mic-select__helper">Loading microphones…</div> : null}

      {inputDeviceListError ? <div className="layercode-mic-select__error">{inputDeviceListError}</div> : null}

      {!isInputDeviceListLoading && !inputDeviceListError && !hasDevices ? <div className="layercode-mic-select__helper">{emptyLabel}</div> : null}

      {helperText ? <div className="layercode-mic-select__helper">{helperText}</div> : null}
    </div>
  );
};

type LayercodeMicrophoneSelectProps = MicrophoneSelectProps;

export { useLayercodeAgent, MicrophoneSelect };
export { MicrophoneSelect as LayercodeMicrophoneSelect };
export type { UseLayercodeAgentOptions, UseLayercodeAgentReturn, MicrophoneSelectProps };
export type { MicrophoneSelectProps as LayercodeMicrophoneSelectProps };
