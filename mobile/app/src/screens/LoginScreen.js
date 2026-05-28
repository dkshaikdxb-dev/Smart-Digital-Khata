import { SafeAreaView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function LoginScreen() {
  return (
    <SafeAreaView>
      <View style={{ padding: 30 }}>
        <Text style={{ fontSize: 28, fontWeight: 'bold' }}>Login</Text>

        <TextInput
          placeholder="Email"
          style={{
            borderWidth: 1,
            borderColor: '#d1d5db',
            padding: 14,
            marginTop: 20,
            borderRadius: 10
          }}
        />

        <TextInput
          placeholder="Password"
          secureTextEntry
          style={{
            borderWidth: 1,
            borderColor: '#d1d5db',
            padding: 14,
            marginTop: 20,
            borderRadius: 10
          }}
        />

        <TouchableOpacity
          style={{
            backgroundColor: '#111827',
            padding: 16,
            marginTop: 24,
            borderRadius: 10
          }}
        >
          <Text style={{ color: '#fff', textAlign: 'center' }}>Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
