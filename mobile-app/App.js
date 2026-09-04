import React, { useState, useMemo } from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';

import { AuthContext } from './src/AuthContext';
import { auth } from './src/services/api';

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

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Smart Khata' }} />
      <HomeStack.Screen name="AddTransaction" component={AddTransactionScreen} options={{ title: 'Add transaction' }} />
    </HomeStack.Navigator>
  );
}

function OrdersStackScreen() {
  return (
    <OrdersStack.Navigator screenOptions={stackScreenOptions}>
      <OrdersStack.Screen name="Orders" component={OrdersScreen} />
      <OrdersStack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Order' }} />
    </OrdersStack.Navigator>
  );
}

function CatalogStackScreen() {
  return (
    <CatalogStack.Navigator screenOptions={stackScreenOptions}>
      <CatalogStack.Screen name="Catalog" component={CatalogScreen} />
    </CatalogStack.Navigator>
  );
}

function CustomersStackScreen() {
  return (
    <CustomersStack.Navigator screenOptions={stackScreenOptions}>
      <CustomersStack.Screen name="Customers" component={CustomersScreen} />
      <CustomersStack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: 'Customer' }} />
      <CustomersStack.Screen name="AddTransaction" component={AddTransactionScreen} options={{ title: 'Add transaction' }} />
    </CustomersStack.Navigator>
  );
}

function MoreStackScreen() {
  return (
    <MoreStack.Navigator screenOptions={stackScreenOptions}>
      <MoreStack.Screen name="More" component={MoreScreen} />
      <MoreStack.Screen name="Families" component={FamiliesScreen} />
      <MoreStack.Screen name="FamilyDetail" component={FamilyDetailScreen} options={{ title: 'Family' }} />
      <MoreStack.Screen name="Insights" component={InsightsScreen} />
      <MoreStack.Screen name="Settings" component={SettingsScreen} />
    </MoreStack.Navigator>
  );
}

const tabIcon = (glyph) => ({ color }) => <Text style={{ fontSize: 18, color }}>{glyph}</Text>;

function OwnerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0f172a', borderTopColor: '#1e293b' },
        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#94a3b8',
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeStackScreen} options={{ title: 'Home', tabBarIcon: tabIcon('🏠') }} />
      <Tab.Screen name="OrdersTab" component={OrdersStackScreen} options={{ title: 'Orders', tabBarIcon: tabIcon('🧾') }} />
      <Tab.Screen name="CatalogTab" component={CatalogStackScreen} options={{ title: 'Catalog', tabBarIcon: tabIcon('📦') }} />
      <Tab.Screen name="CustomersTab" component={CustomersStackScreen} options={{ title: 'Customers', tabBarIcon: tabIcon('👥') }} />
      <Tab.Screen name="MoreTab" component={MoreStackScreen} options={{ title: 'More', tabBarIcon: tabIcon('⋯') }} />
    </Tab.Navigator>
  );
}

export default function App() {
  // 'out' = signed out, 'owner' = owner tabs, 'admin' = web-console notice.
  const [status, setStatus] = useState('out');

  const authActions = useMemo(() => ({
    signIn: (role) => setStatus(role === 'admin' ? 'admin' : 'owner'),
    signOut: async () => { await auth.logout(); setStatus('out'); },
  }), []);

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
