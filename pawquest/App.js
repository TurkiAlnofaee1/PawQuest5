import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import axios from "axios";
import { LocationProvider } from "./src/hooks/useAppLocation";

export default function App() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    axios.get("http://192.168.1.19:5000/") // changed to your PC's IP for real device
      .then(res => setMessage(res.data))
      .catch(err => console.log(err));
  }, []);

  return (
    <LocationProvider>
      <View style={styles.container}>
        <Text>{message || "Loading..."}</Text>
      </View>
    </LocationProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
