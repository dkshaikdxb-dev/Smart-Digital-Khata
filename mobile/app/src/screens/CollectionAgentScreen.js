import { SafeAreaView, Text, View } from 'react-native';

export default function CollectionAgentScreen() {
  return (
    <SafeAreaView>
      <View style={{ padding: 30 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold' }}>
          Collection Agent Dashboard
        </Text>

        <View
          style={{
            backgroundColor: '#ffffff',
            padding: 20,
            marginTop: 20,
            borderRadius: 12
          }}
        >
          <Text>Pending Collections</Text>
          <Text style={{ fontSize: 24, fontWeight: 'bold', marginTop: 10 }}>
            48
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
