import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme';

export default function Notifications() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Notifications — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.navy },
  text: { color: Colors.gray3, fontSize: 16 },
});
