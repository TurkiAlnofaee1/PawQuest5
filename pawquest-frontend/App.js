import { ExpoRoot } from "expo-router";
import { Buffer } from "buffer";
global.Buffer = Buffer;

export default function App() {
  const ctx = require.context("./app");
  return <ExpoRoot context={ctx} />;
}
