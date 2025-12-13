
import "react-native-gesture-handler/jestSetup";

jest.mock("expo-av", () => {
  type PlaybackStatus = { isLoaded: boolean; isPlaying: boolean };
  const mockSound = () => {
    let statusCb: ((status: PlaybackStatus) => void) | null = null;
    return {
      unloadAsync: jest.fn().mockResolvedValue(undefined),
      playAsync: jest.fn().mockImplementation(async () => {
        statusCb?.({ isLoaded: true, isPlaying: true });
      }),
      pauseAsync: jest.fn().mockImplementation(async () => {
        statusCb?.({ isLoaded: true, isPlaying: false });
      }),
      stopAsync: jest.fn().mockResolvedValue(undefined),
      setPositionAsync: jest.fn().mockResolvedValue(undefined),
      setVolumeAsync: jest.fn().mockResolvedValue(undefined),
      setOnPlaybackStatusUpdate: jest.fn().mockImplementation((cb: (status: PlaybackStatus) => void) => {
        statusCb = cb;
      }),
    };
  };

  return {
    Audio: {
      Sound: {
        createAsync: jest.fn(async () => ({ sound: mockSound() })),
      },
      setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    },
    InterruptionModeAndroid: { DuckOthers: 1 },
    InterruptionModeIOS: { DuckOthers: 1 },
  };
});

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  const Icon = ({ name, testID, ...props }: any) =>
    React.createElement(Text, { ...props, testID: testID || "icon" }, name || "icon");
  return {
    Ionicons: Icon,
    MaterialCommunityIcons: Icon,
    MaterialIcons: Icon,
  };
});

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => React.createElement(View, null, children),
    SafeAreaConsumer: ({ children }: any) => children(mockInsets),
    useSafeAreaInsets: () => mockInsets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    initialWindowMetrics: {
      frame: { x: 0, y: 0, width: 0, height: 0 },
      insets: mockInsets,
    },
  };
});

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});
