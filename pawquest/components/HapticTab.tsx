import React from 'react';
import { TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';

type Props = React.ComponentProps<typeof TouchableOpacity> & {
  onPress?: () => void;
};

export function HapticTab({ onPress, ...props }: Props) {
  return (
    <TouchableOpacity
      {...props}
      onPress={async () => {
        try {
          await Haptics.selectionAsync();
        } catch {}
        onPress?.();
      }}
      activeOpacity={0.7}
    />
  );
}
