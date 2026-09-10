import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { colors } from './theme';
import { LanguageProvider, useT } from './i18n';
import { CartProvider } from './CartContext';
import { ConsumerAuthContext } from './ConsumerAuthContext';
import { getToken, setToken, clearToken, setUnauthorizedHandler } from './consumerApi';

import LoginOtpScreen from './screens/LoginOtpScreen';
import KhataScreen from './screens/KhataScreen';
import ShopKhataScreen from './screens/ShopKhataScreen';
import PayWebView from './screens/PayWebView';
import ShopsScreen from './screens/ShopsScreen';
import ShopDetailScreen from './screens/ShopDetailScreen';
import CartScreen from './screens/CartScreen';
import OrdersScreen from './screens/OrdersScreen';
import OrderDetailScreen from './screens/OrderDetailScreen';
import AccountScreen from './screens/AccountScreen';
import FeatureWebView from '../screens/FeatureWebView';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const KhataStack = createNativeStackNavigator();
const ShopsStack = createNativeStackNavigator();
const OrdersStack = createNativeStackNavigator();
const AccountStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '800' },
  contentStyle: { backgroundColor: colors.bg },
};

function KhataStackScreen() {
  const { t } = useT();
  return (
    <KhataStack.Navigator screenOptions={stackScreenOptions}>
      <KhataStack.Screen name="KhataList" component={KhataScreen} options={{ title: t('khata.title') }} />
      <KhataStack.Screen name="ShopKhata" component={ShopKhataScreen} options={{ title: t('shopkhata.title') }} />
      <KhataStack.Screen name="PayWebView" component={PayWebView} options={{ title: t('pay.title') }} />
    </KhataStack.Navigator>
  );
}

function ShopsStackScreen() {
  const { t } = useT();
  return (
    <ShopsStack.Navigator screenOptions={stackScreenOptions}>
      <ShopsStack.Screen name="ShopsList" component={ShopsScreen} options={{ title: t('shops.title') }} />
      <ShopsStack.Screen name="ShopDetail" component={ShopDetailScreen} options={{ title: t('tab.shops') }} />
      <ShopsStack.Screen name="Cart" component={CartScreen} options={{ title: t('cart.title') }} />
      <ShopsStack.Screen name="PayWebView" component={PayWebView} options={{ title: t('pay.title') }} />
    </ShopsStack.Navigator>
  );
}

function OrdersStackScreen() {
  const { t } = useT();
  return (
    <OrdersStack.Navigator screenOptions={stackScreenOptions}>
      <OrdersStack.Screen name="OrdersList" component={OrdersScreen} options={{ title: t('orders.title') }} />
      <OrdersStack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: t('orderdetail.title') }} />
    </OrdersStack.Navigator>
  );
}

function AccountStackScreen() {
  const { t } = useT();
  return (
    <AccountStack.Navigator screenOptions={stackScreenOptions}>
      <AccountStack.Screen name="AccountHome" component={AccountScreen} options={{ title: t('account.title') }} />
      <AccountStack.Screen
        name="FeatureWebView"
        component={FeatureWebView}
        options={({ route }) => ({ title: route.params?.title || t('account.title') })}
      />
    </AccountStack.Navigator>
  );
}

const tabIcon = (glyph) => ({ color }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

function SignedInTabs() {
  const { t } = useT();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border, height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen name="KhataTab" component={KhataStackScreen} options={{ title: t('tab.khata'), tabBarIcon: tabIcon('📒') }} />
      <Tab.Screen name="ShopsTab" component={ShopsStackScreen} options={{ title: t('tab.shops'), tabBarIcon: tabIcon('🏪') }} />
      <Tab.Screen name="OrdersTab" component={OrdersStackScreen} options={{ title: t('tab.orders'), tabBarIcon: tabIcon('📦') }} />
      <Tab.Screen name="AccountTab" component={AccountStackScreen} options={{ title: t('tab.account'), tabBarIcon: tabIcon('👤') }} />
    </Tab.Navigator>
  );
}

// The rooted navigator: a loading gate while the stored token is read, then
// either the OTP login stack (signed out) or the bottom tabs (signed in).
function Root() {
  // status: 'loading' | 'out' | 'in'
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let alive = true;
    getToken().then((tok) => { if (alive) setStatus(tok ? 'in' : 'out'); });
    return () => { alive = false; };
  }, []);

  const authActions = useMemo(() => ({
    signIn: async (token) => { await setToken(token); setStatus('in'); },
    signOut: async () => { await clearToken(); setStatus('out'); },
  }), []);

  // Any 401 from consumerApi signs the user out (token already cleared there).
  const handleUnauthorized = useCallback(() => setStatus('out'), []);
  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ConsumerAuthContext.Provider value={authActions}>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          {status === 'in' ? (
            <RootStack.Screen name="SignedIn" component={SignedInTabs} />
          ) : (
            <RootStack.Screen name="Login" component={LoginOtpScreen} />
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </ConsumerAuthContext.Provider>
  );
}

// The consumer flavor's whole app: providers wrap one rooted navigator.
export default function ConsumerApp() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <LanguageProvider>
        <CartProvider>
          <Root />
        </CartProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
