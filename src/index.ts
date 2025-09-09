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

  const [status, setStatus] = useState('initializing');
  const [userAudioAmplitude, setUserAudioAmplitude] = useState(0);
  const [agentAudioAmplitude, setAgentAudioAmplitude] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  // Reference to the LayercodeClient instance
  const clientRef = useRef<LayercodeClient | null>(null);

  // Initialize the client on component mount
  useEffect(() => {
    // Create a new LayercodeClient instance
    console.log('Creating LayercodeClient instance');
    clientRef.current = new LayercodeClient({
      agentId,
      conversationId,
      authorizeSessionEndpoint,
      metadata,
      onConnect: ({ conversationId }: { conversationId: string | null }) => {
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

    // Pass the override websocket URL if provided. Use for local development.
    if (options['_websocketUrl']) {
      clientRef.current._websocketUrl = options['_websocketUrl'];
    }

    // Set initial mute state from JS SDK
    setIsMuted(clientRef.current.isMuted);
    
    // Connect to the agent
    clientRef.current.connect().catch((error: Error) => {
      console.error('Failed to connect to agent:', error);
      onError?.(error);
    });

    // Cleanup function to disconnect when component unmounts
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
    // Add the internal override URL to the dependency array
  }, [agentId, conversationId, authorizeSessionEndpoint]); // Make sure metadata isn't causing unnecessary re-renders if it changes often

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
  const connect = useCallback(() => {
    clientRef.current?.connect();
  }, []);
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
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

    // State
    status,
    userAudioAmplitude,
    agentAudioAmplitude,
    isMuted,
  };
};

export { useLayercodeAgent, UseLayercodeAgentOptions }; // Export the type too
