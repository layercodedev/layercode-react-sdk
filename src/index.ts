import { useState, useEffect, useCallback, useRef } from 'react';
import LayercodeClient, { type AgentConfig, type AuthorizeSessionRequest } from '@layercode/js-sdk';

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
  onAudioInputChanged?: (audioInput: boolean) => void;
  enableAmplitudeMonitoring?: boolean;
}

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
  } = options;
  const websocketUrlOverride = options['_websocketUrl'];
  const enableAmplitudeMonitoring = options.enableAmplitudeMonitoring ?? true;

  const [status, setStatus] = useState('initializing');
  const [userAudioAmplitude, setUserAudioAmplitude] = useState(0);
  const [agentAudioAmplitude, setAgentAudioAmplitude] = useState(0);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [audioInput, _setAudioInput] = useState<boolean>(options.audioInput ?? true);
  const [isMuted, setIsMuted] = useState(false);
  const [internalConversationId, setInternalConversationId] = useState<string | null | undefined>(conversationId);
  const conversationIdRef = useRef<string | undefined>(conversationId);
  // Reference to the LayercodeClient instance
  const clientRef = useRef<LayercodeClient | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
    if (conversationId !== undefined) {
      setInternalConversationId(conversationId);
    } else {
      setInternalConversationId(undefined);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!enableAmplitudeMonitoring) {
      setUserAudioAmplitude(0);
      setAgentAudioAmplitude(0);
    }
  }, [enableAmplitudeMonitoring]);

  const createClient = useCallback(
    (initialConversationId: string | null) => {
      console.log('Creating LayercodeClient instance');
      const client = new LayercodeClient({
        agentId,
        conversationId: initialConversationId,
        authorizeSessionEndpoint,
        authorizeSessionRequest,
        metadata,
        audioInput,
        audioInputChanged: (next: boolean) => {
          _setAudioInput(next);
          onAudioInputChanged?.(next);
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
      audioInput,
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
    clientRef.current?.mute();
  }, []);

  const unmute = useCallback(() => {
    clientRef.current?.unmute();
  }, []);

  const setAudioInput = useCallback(
    (state: React.SetStateAction<boolean>) => {
      _setAudioInput(state);
      const next = typeof state === 'function' ? (state as (prev: boolean) => boolean)(audioInput) : state;
      clientRef.current?.setAudioInput(next);
    },
    [_setAudioInput, clientRef, audioInput]
  );

  const triggerUserTurnStarted = useCallback(() => {
    clientRef.current?.triggerUserTurnStarted();
  }, []);
  const triggerUserTurnFinished = useCallback(() => {
    clientRef.current?.triggerUserTurnFinished();
  }, []);
  const sendClientResponseText = useCallback((text: string) => {
    clientRef.current?.sendClientResponseText(text);
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
      await client.connect();
    } catch (error) {
      console.error('Failed to connect to agent:', error);
      onError?.(error as Error);
      throw error;
    }
  }, [createClient, internalConversationId, onError]);
  const disconnect = useCallback(async () => {
    if (!clientRef.current) {
      return;
    }

    const client = clientRef.current;
    clientRef.current = null;

    try {
      await client.disconnect();
    } catch (error) {
      console.error('Failed to disconnect from agent:', error);
      onError?.(error as Error);
      throw error;
    }
  }, [onError]);

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

    setAudioInput,

    // State
    status,
    userAudioAmplitude,
    agentAudioAmplitude,
    userSpeaking,
    agentSpeaking,
    isMuted,
    conversationId: internalConversationId,
    audioInput,
  };
};

export { useLayercodeAgent, UseLayercodeAgentOptions }; // Export the type too
