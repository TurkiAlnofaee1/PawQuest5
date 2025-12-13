import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import AudioBar from "../components/AudioBar";

describe("AudioBar", () => {
  it("hides when not visible", () => {
    const tree = render(
      <AudioBar title="Hidden" visible={false} controlledState={{ isPlaying: false, onPlay: jest.fn(), onPause: jest.fn() }} />
    ).toJSON();
    expect(tree).toBeNull();
  });

  it("renders with controlled state and fires play/pause callbacks", () => {
    const onPlay = jest.fn();
    const onPause = jest.fn();
    const { getByText, rerender } = render(
      <AudioBar
        title="Story"
        visible
        controlledState={{ isPlaying: false, statusText: "Ready", onPlay, onPause }}
      />,
    );

    // play
    fireEvent.press(getByText("play"));
    expect(onPlay).toHaveBeenCalled();

    // pause
    rerender(
      <AudioBar
        title="Story"
        visible
        controlledState={{ isPlaying: true, statusText: "Playing", onPlay, onPause }}
      />,
    );
    fireEvent.press(getByText("pause"));
    expect(onPause).toHaveBeenCalled();

    expect(getByText("Story")).toBeTruthy();
    expect(getByText(/Ready|Playing/)).toBeTruthy();
  });
});
