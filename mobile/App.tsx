import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useFonts } from "expo-font";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PlatformApp from "./src/platform/App";
import { c } from "./src/platform/ui";
export default function App() {
  const [loaded, error] = useFonts({
    DMSans: require("./assets/fonts/DMSans-Regular.ttf"),
    DMSansSemiBold: require("./assets/fonts/DMSans-SemiBold.ttf"),
    ...Ionicons.font,
  });
  return (
    <SafeAreaProvider>
      {loaded ? (
        <PlatformApp />
      ) : (
        <View
          style={{
            flex: 1,
            backgroundColor: c.bg,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {error ? (
            <Text style={{ color: c.text }}>
              Could not load app fonts. Close and reopen Hairflix.
            </Text>
          ) : (
            <ActivityIndicator
              accessibilityLabel="Loading Hairflix"
              color={c.red}
            />
          )}
        </View>
      )}
    </SafeAreaProvider>
  );
}
