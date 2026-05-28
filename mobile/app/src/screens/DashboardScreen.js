import { SafeAreaView, Text, View } from 'react-native';

export default function DashboardScreen() {
  return (
    <SafeAreaView>
      <View style={{ padding: 30 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold' }}>
          Merchant Dashboard
        </Text>

        <View
          style={{
            backgroundColor: '#ffffff',
            padding: 20,
            marginTop: 20,
            borderRadius: 12
          }}
        >
          <Text>Total Collections</Text>
          <Text style={{ fontSize: 24, fontWeight: 'bold', marginTop: 10 }}>
            ₹ 2,45,000
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
