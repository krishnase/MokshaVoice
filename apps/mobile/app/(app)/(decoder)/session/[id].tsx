import { View, Text, StyleSheet } from 'react-native';

export default function DecoderSession() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Decoder Session — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D0D0D' },
  text: { color: '#888', fontSize: 16 },
});
