# Layercode React SDK

Build polished Layercode agent experiences in React with a single hook and a few UI helpers.

## Installation

```bash
npm install @layercode/react-sdk
```

> When developing in this repo we consume the package via a local file dependency (`layercode-react-sdk`). When publishing, the package name remains `@layercode/react-sdk`.

## Quick start

```tsx
import { MicrophoneSelect, useLayercodeAgent } from '@layercode/react-sdk';

export function VoiceAgent() {
  const agent = useLayercodeAgent({
    agentId: process.env.NEXT_PUBLIC_LAYERCODE_AGENT_ID!,
    authorizeSessionEndpoint: '/api/authorize',
    onMessage: (event) => {
      if (event.type === 'response.text') {
        console.log('Agent says:', event.content);
      }
    },
  });

  return (
    <div>
      <button onClick={() => agent.connect()}>Connect</button>
      <MicrophoneSelect agent={agent} helperText="Pick an input before connecting." />
      <p>User speaking? {agent.userSpeaking ? 'yes' : 'no'}</p>
      <p>Agent speaking? {agent.agentSpeaking ? 'yes' : 'no'}</p>
    </div>
  );
}
```

## Microphone selection

`useLayercodeAgent` now exposes microphone state and helpers:

- `availableInputDevices`: list of normalized `LayercodeAudioInputDevice`s.
- `activeInputDeviceId` / `preferredInputDeviceId`: reflect what is currently in use or what the user picked.
- `refreshInputDevices()`: manually re-enumerate mics (permissions are requested automatically the first time).
- `selectInputDevice(deviceId: string | null)`: persist the preferred device, even before connecting.

Pair those fields with the ready-made `<MicrophoneSelect />` component to ship a drop-in selector with loading/error states. The component accepts plain `select` props plus a few extras (`helperText`, `containerClassName`, `autoRefresh`). (There is also a `LayercodeMicrophoneSelect` alias for backwards compatibility.)

All React-only logic (state, refs, UI) lives in this package; device enumeration, watchers, and permission handling are implemented in `@layercode/js-sdk`, so they can also be used outside React.

## Speaking state

The hook surfaces `userSpeaking` and `agentSpeaking` booleans. They flip to `true` whenever VAD detects speech (user) or when the agent begins streaming audio (agent). This makes it trivial to render pulse indicators, avatar animations, or “agent typing” affordances without manually parsing websocket messages.

## Documentation

Full API reference lives in the docs: [https://docs.layercode.com/sdk-reference/react-sdk](https://docs.layercode.com/sdk-reference/react-sdk)
