import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Text, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';

import { AuthContext } from './src/AuthContext';
import { auth, getToken, getRole, setUnauthorizedHandler } from './src/services/api';
import ConsumerApp from './src/consumer/ConsumerApp';
import { LanguageProvider, useT } from './src/i18n';

import LoginScreen from './src/screens/LoginScreen';
import AdminNoticeScreen from './src/screens/AdminNoticeScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import AddTransactionScreen from './src/screens/AddTransactionScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import CatalogScreen from './src/screens/CatalogScreen';
import CustomersScreen from './src/screens/CustomersScreen';
import CustomerDetailScreen from './src/screens/CustomerDetailScreen';
import MoreScreen from './src/screens/MoreScreen';
import FamiliesScreen from './src/screens/FamiliesScreen';
import FamilyDetailScreen from './src/screens/FamilyDetailScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import FeatureWebView from './src/screens/FeatureWebView';
import OrderAlertBanner from './src/components/OrderAlertBanner';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const OrdersStack = createNativeStackNavigator();
const CatalogStack = createNativeStackNavigator();
const CustomersStack = createNativeStackNavigator();
const MoreStack = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: '#0f172a' },
  headerTintColor: '#e2e8f0',
  contentStyle: { backgroundColor: '#0f172a' },
};

// Navigation titles read `t` from the language context. Each *StackScreen /
// OwnerTabs is a component rendered inside LanguageProvider, so it re-renders on a
// language change and React Navigation re-applies the localized `options` titles —
// the least invasive way to localize headers without per-screen setOptions.
function HomeStackScreen() {
  const { t } = useT();
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} options={{ title: t('title.dashboard') }} />
      <HomeStack.Screen name="AddTransaction" component={AddTransactionScreen} options={{ title: t('title.addTransaction') }} />
    </HomeStack.Navigator>
  );
}

function OrdersStackScreen() {
  const { t } = useT();
  return (
    <OrdersStack.Navigator screenOptions={stackScreenOptions}>
      <OrdersStack.Screen name="Orders" component={OrdersScreen} options={{ title: t('tab.orders') }} />
      <OrdersStack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: t('title.order') }} />
    </OrdersStack.Navigator>
  );
}

function CatalogStackScreen() {
  const { t } = useT();
  return (
    <CatalogStack.Navigator screenOptions={stackScreenOptions}>
      <CatalogStack.Screen name="Catalog" component={CatalogScreen} options={{ title: t('tab.catalog') }} />
    </CatalogStack.Navigator>
  );
}

function CustomersStackScreen() {
  const { t } = useT();
  return (
    <CustomersStack.Navigator screenOptions={stackScreenOptions}>
      <CustomersStack.Screen name="Customers" component={CustomersScreen} options={{ title: t('tab.customers') }} />
      <CustomersStack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: t('title.customer') }} />
      <CustomersStack.Screen name="AddTransaction" component={AddTransactionScreen} options={{ title: t('title.addTransaction') }} />
    </CustomersStack.Navigator>
  );
}

function MoreStackScreen() {
  const { t } = useT();
  return (
    <MoreStack.Navigator screenOptions={stackScreenOptions}>
      <MoreStack.Screen name="More" component={MoreScreen} options={{ title: t('tab.more') }} />
      <MoreStack.Screen name="Families" component={FamiliesScreen} options={{ title: t('title.families') }} />
      <MoreStack.Screen name="FamilyDetail" component={FamilyDetailScreen} options={{ title: t('title.family') }} />
      <MoreStack.Screen name="Insights" component={InsightsScreen} options={{ title: t('title.insights') }} />
      <MoreStack.Screen name="Settings" component={SettingsScreen} options={{ title: t('title.settings') }} />
      <MoreStack.Screen
        name="FeatureWebView"
        component={FeatureWebView}
        options={({ route }) => ({ title: route.params?.title || t('title.dashboard') })}
      />
    </MoreStack.Navigator>
  );
}

const tabIcon = (glyph) => ({ color }) => <Text style={{ fontSize: 18, color }}>{glyph}</Text>;

function OwnerTabs() {
  const { t } = useT();
  // The repeating new-order alert banner (batch ORDERALERT) is mounted HERE,
  // beside the tab navigator inside one flex container, so it floats over every
  // tab and every screen — an owner mid-way through adding a transaction still
  // sees that an order is waiting. It is only ever rendered on this owner-tabs
  // branch, i.e. only for a signed-in owner/staff session.
  //
  // Pure JS: the banner uses AppState + timers + the existing expo-speech voice
  // hook. No notification module, no new dependency — this whole feature rides
  // an OTA update.
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1e293b' },
          tabBarActiveTintColor: '#22c55e',
          tabBarInactiveTintColor: '#94a3b8',
        }}
      >
        <Tab.Screen name="HomeTab" component={HomeStackScreen} options={{ title: t('tab.home'), tabBarIcon: tabIcon('🏠') }} />
        <Tab.Screen name="OrdersTab" component={OrdersStackScreen} options={{ title: t('tab.orders'), tabBarIcon: tabIcon('🧾') }} />
        <Tab.Screen name="CatalogTab" component={CatalogStackScreen} options={{ title: t('tab.catalog'), tabBarIcon: tabIcon('📦') }} />
        <Tab.Screen name="CustomersTab" component={CustomersStackScreen} options={{ title: t('tab.customers'), tabBarIcon: tabIcon('👥') }} />
        <Tab.Screen name="MoreTab" component={MoreStackScreen} options={{ title: t('tab.more'), tabBarIcon: tabIcon('⋯') }} />
      </Tab.Navigator>
      <OrderAlertBanner />
    </View>
  );
}

// Only shop-side roles get the owner tabs; every other role (admin, distributor,
// or an unknown/missing role) has no shopId here and would hit 403s/empty
// screens, so it is routed to the AdminNotice which points it at the right
// console. Keep this mapping identical on the boot-restore path and signIn.
function statusForRole(role) {
  return role === 'owner' || role === 'staff' ? 'owner' : 'admin';
}

function OwnerApp() {
  // 'loading' = restoring a persisted session, 'out' = signed out,
  // 'owner' = owner tabs, 'admin' = web-console notice.
  const [status, setStatus] = useState('loading');

  // Restore a persisted session on launch so a signed-in owner is NOT asked to
  // log in again every time the app opens — the token lives in SecureStore
  // until sign-out or expiry. Mirrors the consumer app's boot gate.
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await getToken();
      if (!alive) return;
      if (!token) { setStatus('out'); return; }
      const role = await getRole();
      if (!alive) return;
      setStatus(statusForRole(role));
    })();
    return () => { alive = false; };
  }, []);

  const authActions = useMemo(() => ({
    signIn: (role) => setStatus(statusForRole(role)),
    signOut: async () => { await auth.logout(); setStatus('out'); },
  }), []);

  // Any 401 (expired/revoked token) drops the session and returns to Login.
  const handleUnauthorized = useCallback(() => setStatus('out'), []);
  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={authActions}>
      <NavigationContainer>
        <StatusBar style="light" />
        <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f172a' } }}>
          {status === 'out' ? (
            <RootStack.Screen name="Login" component={LoginScreen} />
          ) : status === 'admin' ? (
            <RootStack.Screen name="AdminNotice" component={AdminNoticeScreen} />
          ) : (
            <RootStack.Screen name="Owner" component={OwnerTabs} />
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}

export default function App() {
  const flavor = Constants.expoConfig?.extra?.flavor || 'owner';
  // The owner flavor is wrapped in LanguageProvider so every owner screen and the
  // navigation chrome can localize via useT. The consumer flavor keeps its own,
  // separate provider inside ConsumerApp — the two are untouched by each other.
  return flavor === 'consumer' ? <ConsumerApp /> : (
    <LanguageProvider>
      <OwnerApp />
    </LanguageProvider>
  );
}
