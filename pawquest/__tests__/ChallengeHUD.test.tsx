
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ChallengeHUD from "../components/ChallengeHUD";

describe("ChallengeHUD", () => {
  const baseProps = {
    distanceText: "120 m",
    timeText: "2 min",
    progress: 0.25,
    instruction: "Keep going",
    loading: false,
  };

  it("renders active mode with progress and instruction", () => {
    const { getByText, queryByText } = render(
      <ChallengeHUD {...baseProps} mode="active" onCapture={jest.fn()} />,
      { wrapper: SafeAreaProvider },
    );

    expect(getByText("Remaining")).toBeTruthy();
    expect(getByText("120 m")).toBeTruthy();
    expect(getByText("ETA")).toBeTruthy();
    expect(getByText("2 min")).toBeTruthy();
    expect(getByText("25%")).toBeTruthy();
    expect(getByText(/Keep going/i)).toBeTruthy();
    expect(queryByText("Capture Pet")).toBeNull();
  });

  it("shows loading state message", () => {
    const { getByText } = render(
      <ChallengeHUD {...baseProps} mode="active" loading onCapture={jest.fn()} />,
      { wrapper: SafeAreaProvider },
    );
    expect(getByText(/Updating route/i)).toBeTruthy();
  });

  it("renders complete mode and handles capture press", () => {
    const onCapture = jest.fn();
    const { getByText } = render(
      <ChallengeHUD {...baseProps} mode="complete" onCapture={onCapture} />,
      { wrapper: SafeAreaProvider },
    );

    fireEvent.press(getByText("Capture Pet"));
    expect(onCapture).toHaveBeenCalled();
  });
});
