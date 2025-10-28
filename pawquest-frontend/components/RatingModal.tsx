import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type RatingModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number) => void | Promise<void>;
  title?: string;
  initialValue?: number;
  allowSkip?: boolean;
};

const STARS = [1, 2, 3, 4, 5] as const;

export default function RatingModal({
  visible,
  onClose,
  onSubmit,
  title = "Rate this challenge",
  initialValue,
  allowSkip = true,
}: RatingModalProps) {
  const [selected, setSelected] = useState<number>(initialValue ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shouldRender, setShouldRender] = useState(visible);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      setSelected(
        typeof initialValue === "number" && initialValue >= 1 && initialValue <= 5
          ? initialValue
          : 0,
      );

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
          tension: 90,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
          easing: Easing.in(Easing.ease),
        }),
        Animated.timing(scale, {
          toValue: 0.95,
          duration: 140,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setShouldRender(false);
          setIsSubmitting(false);
        }
      });
    }
  }, [visible, initialValue, opacity, scale]);

  const disableSubmit = isSubmitting || selected < 1;

  const handleSubmit = useCallback(async () => {
    if (disableSubmit) return;
    try {
      setIsSubmitting(true);
      await onSubmit(selected);
    } catch (error) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[RatingModal] submit failed", error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [disableSubmit, onSubmit, selected]);

  const stars = useMemo(
    () =>
      STARS.map((value) => {
        const active = selected >= value;
        return (
          <Pressable
            key={value}
            accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setSelected(value)}
            style={({ pressed }) => [
              styles.starButton,
              pressed && { transform: [{ scale: 0.95 }] },
            ]}
            testID={`rating-star-${value}`}
          >
            <Ionicons
              name={active ? "star" : "star-outline"}
              size={36}
              color={active ? "#FACC15" : "#D1D5DB"}
            />
          </Pressable>
        );
      }),
    [selected],
  );

  if (!shouldRender) return null;

  return (
    <Modal
      visible={shouldRender}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={allowSkip ? onClose : () => {}}
      presentationStyle="overFullScreen"
      accessibilityViewIsModal
    >
      <View style={styles.backdrop} accessibilityElementsHidden={!visible}>
        <Animated.View
          style={[styles.card, { opacity, transform: [{ scale }] }]}
          accessibilityViewIsModal
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.caption}>Tap to rate</Text>

          <View
            style={styles.starsRow}
            accessibilityRole="adjustable"
            accessibilityHint="Select a rating from one to five stars"
            focusable
            importantForAccessibility="yes"
          >
            {stars}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              disableSubmit && styles.submitDisabled,
              pressed && !disableSubmit && { transform: [{ scale: 0.98 }] },
            ]}
            onPress={handleSubmit}
            disabled={disableSubmit}
            testID="rating-submit"
          >
            <Text style={styles.submitText}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </Text>
          </Pressable>

          {allowSkip ? (
            <Pressable
              style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.7 }]}
              onPress={onClose}
              disabled={isSubmitting}
              testID="rating-cancel"
            >
              <Text style={styles.cancelText}>Not now</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  caption: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  starsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  starButton: {
    padding: 4,
  },
  submitButton: {
    marginTop: 28,
    backgroundColor: "#0B3D1F",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 160,
  },
  submitDisabled: {
    backgroundColor: "#9CA3AF",
  },
  submitText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0B3D1F",
  },
});
