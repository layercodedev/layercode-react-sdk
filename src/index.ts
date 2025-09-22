import { useState, useEffect, useCallback, useRef } from 'react';
import LayercodeClient from '@layercode/js-sdk';

/**
 * Configuration options for the useLayercodeAgent hook.
 */
interface UseLayercodeAgentOptions {
  agentId: string;
  conversationId?: string;
  authorizeSessionEndpoint: string;
  metadata?: Record<string, any>;
  onConnect?: ({ conversationId }: { conversationId: string | null }) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onDataMessage?: (data: any) => void;
  onMuteStateChange?: (isMuted: boolean) => void;
  onMessage?: (data: any) => void;
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
  const { agentId, conversationId, authorizeSessionEndpoint, metadata = {}, onConnect, onDisconnect, onError, onDataMessage, onMessage, onMuteStateChange } = options;
  const websocketUrlOverride = options['_websocketUrl'];

  const [status, setStatus] = useState('initializing');
  const [userAudioAmplitude, setUserAudioAmplitude] = useState(0);
  const [agentAudioAmplitude, setAgentAudioAmplitude] = useState(0);
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

  const createClient = useCallback(
    (initialConversationId: string | null) => {
      console.log('Creating LayercodeClient instance');
      const client = new LayercodeClient({
        agentId,
        conversationId: initialConversationId,
        authorizeSessionEndpoint,
        metadata,
        onConnect: ({ conversationId }: { conversationId: string | null }) => {
          setInternalConversationId((current) => {
            if (conversationIdRef.current === undefined) {
              return conversationId;
            }
            return conversationId ?? current ?? null;
          });
          onConnect?.({ conversationId });
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
        onUserAmplitudeChange: (amplitude: number) => {
          setUserAudioAmplitude(amplitude);
        },
        onAgentAmplitudeChange: (amplitude: number) => {
          setAgentAudioAmplitude(amplitude);
        },
        onMuteStateChange: (muted: boolean) => {
          setIsMuted(muted);
          onMuteStateChange?.(muted);
        },
      });

      if (websocketUrlOverride) {
        client._websocketUrl = websocketUrlOverride;
      }

      setIsMuted(client.isMuted);
      clientRef.current = client;
      return client;
    },
    [agentId, authorizeSessionEndpoint, metadata, onConnect, onDataMessage, onDisconnect, onError, onMessage, onMuteStateChange, websocketUrlOverride]
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

  const triggerUserTurnStarted = useCallback(() => {
    clientRef.current?.triggerUserTurnStarted();
  }, []);
  const triggerUserTurnFinished = useCallback(() => {
    clientRef.current?.triggerUserTurnFinished();
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

    const nextConversationId =
      conversationIdRef.current !== undefined
        ? conversationIdRef.current
        : internalConversationId ?? null;

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

    // State
    status,
    userAudioAmplitude,
    agentAudioAmplitude,
    isMuted,
    conversationId: internalConversationId,
  };
};

export { useLayercodeAgent, UseLayercodeAgentOptions }; // Export the type too
