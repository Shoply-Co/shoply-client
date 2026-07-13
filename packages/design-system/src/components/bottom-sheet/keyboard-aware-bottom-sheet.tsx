import type { PropsWithChildren } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ModalProps,
  type StyleProp,
  type ViewStyle
} from "react-native";

export interface KeyboardAwareBottomSheetProps extends PropsWithChildren {
  visible: boolean;
  onClose: () => void;
  accessibilityLabel: string;
  animationType?: ModalProps["animationType"];
  backdropStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

export function KeyboardAwareBottomSheet({
  visible,
  onClose,
  accessibilityLabel,
  animationType = "slide",
  backdropStyle,
  contentStyle,
  keyboardVerticalOffset = 0,
  children
}: KeyboardAwareBottomSheetProps) {
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      presentationStyle="overFullScreen"
      onRequestClose={close}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={[styles.backdrop, backdropStyle]}
          onPress={close}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardVerticalOffset}
          pointerEvents="box-none"
          style={styles.keyboardAvoider}
        >
          <View style={contentStyle}>{children}</View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  backdrop: {
    backgroundColor: "rgba(5, 5, 7, 0.42)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  keyboardAvoider: {
    flex: 1,
    justifyContent: "flex-end"
  }
});
