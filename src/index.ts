import { useState, useEffect, useCallback, useRef } from 'react';
import LayercodeClient from '@layercode/js-sdk';

/**
 * Configuration options for the useLayercodeAgent hook.
 */
interface UseLayercodeAgentOptions {
  agentId: string;
  sessionId?: string;
  authorizeSessionEndpoint: string;
  metadata?: Record<string, any>;
  onConnect?: ({ sessionId }: { sessionId: string | null }) => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onDataMessage?: (data: any) => void;
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
  const { agentId, sessionId, authorizeSessionEndpoint, metadata = {}, onConnect, onDisconnect, onError, onDataMessage } = options;

  const [status, setStatus] = useState('initializing');
  const [userAudioAmplitude, setUserAudioAmplitude] = useState(0);
  const [agentAudioAmplitude, setAgentAudioAmplitude] = useState(0);
  // Reference to the LayercodeClient instance
  const clientRef = useRef<LayercodeClient | null>(null);

  // Initialize the client on component mount
  useEffect(() => {
    // Create a new LayercodeClient instance
    console.log('Creating LayercodeClient instance');
    clientRef.current = new LayercodeClient({
      agentId,
      sessionId,
      authorizeSessionEndpoint,
      metadata,
      onConnect: ({ sessionId }: { sessionId: string | null }) => {
        onConnect?.({ sessionId });
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
      onStatusChange: (newStatus: string) => {
        setStatus(newStatus);
      },
      onUserAmplitudeChange: (amplitude: number) => {
        setUserAudioAmplitude(amplitude);
      },
      onAgentAmplitudeChange: (amplitude: number) => {
        setAgentAudioAmplitude(amplitude);
      },
    });

    // Pass the override websocket URL if provided. Use for local development.
    if (options['_websocketUrl']) {
      clientRef.current._websocketUrl = options['_websocketUrl'];
    }

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
  }, [agentId, sessionId, authorizeSessionEndpoint]); // Make sure metadata isn't causing unnecessary re-renders if it changes often

  // Class methods
  // TODO: Mic mute
  // const setMuteMic = useCallback((mute: boolean) => {
  //   // clientRef.current?.setMuteMic(mute);
  // }, []);
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

    // State
    status,
    userAudioAmplitude,
    agentAudioAmplitude,
  };
};

export { useLayercodeAgent, UseLayercodeAgentOptions }; // Export the type too
