import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { colors } from './theme';
import { LanguageProvider, useT } from './i18n';
import { CartProvider, useCart } from './CartContext';
import { ConsumerAuthContext } from './ConsumerAuthContext';
import { getToken, setToken, clearToken, setUnauthorizedHandler } from './consumerApi';

import LoginOtpScreen from './screens/LoginOtpScreen';
import KhataScreen from './screens/KhataScreen';
import ShopKhataScreen from './screens/ShopKhataScreen';
import PayWebView from './screens/PayWebView';
import ShopsScreen from './screens/ShopsScreen';
import ShopDetailScreen from './screens/ShopDetailScreen';
import CartScreen from './screens/CartScreen';
import ProductSearchScreen from './screens/ProductSearchScreen';
import OrdersScreen from './screens/OrdersScreen';
import OrderDetailScreen from './screens/OrderDetailScreen';
import AccountScreen from './screens/AccountScreen';
import ChangeNumberScreen from './screens/ChangeNumberScreen';
import StatementScreen from './screens/StatementScreen';
import ReferralScreen from './screens/ReferralScreen';
import HelpFaqScreen from './screens/HelpFaqScreen';
import FeatureWebView from '../screens/FeatureWebView';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const KhataStack = createNativeStackNavigator();
const ShopsStack = createNativeStackNavigator();
const ProductsStack = createNativeStackNavigator();
const CartStack = createNativeStackNavigator();
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
      {/* Cross-shop product search (P4), reached from the directory's product
          bar and its category chips — the same entry points the web has. */}
      <ShopsStack.Screen name="ProductSearch" component={ProductSearchScreen} options={{ title: t('psearch.title') }} />
      <ShopsStack.Screen name="ShopDetail" component={ShopDetailScreen} options={{ title: t('tab.shops') }} />
      <ShopsStack.Screen name="PayWebView" component={PayWebView} options={{ title: t('pay.title') }} />
    </ShopsStack.Navigator>
  );
}

// Cross-shop product search is a TAB, as it is on the web. It was registered
// only inside the Shops stack, reachable solely by first landing on the shop
// directory and then noticing the product bar at the top of it — so the one
// feature that answers "who near me sells this?" was hidden behind the question
// it exists to replace. It keeps its door in the Shops stack as well (the
// directory's product bar and category chips still push it there); a feature
// with two doors is fine, a feature with none is not.
//
// The stack carries ShopDetail and PayWebView too, so tapping a result opens the
// seller INSIDE this tab rather than throwing the shopper over to another one
// and losing their search.
function ProductsStackScreen() {
  const { t } = useT();
  return (
    <ProductsStack.Navigator screenOptions={stackScreenOptions}>
      <ProductsStack.Screen name="ProductSearchHome" component={ProductSearchScreen} options={{ title: t('psearch.title') }} />
      <ProductsStack.Screen name="ShopDetail" component={ShopDetailScreen} options={{ title: t('tab.shops') }} />
      <ProductsStack.Screen name="PayWebView" component={PayWebView} options={{ title: t('pay.title') }} />
    </ProductsStack.Navigator>
  );
}

// The cart is a TAB now, not a screen buried in the Shops stack. It used to be
// registered only there, reachable solely from the floating bar on the one
// storefront it was built at: a shopper who added items and then tapped Khata
// or Orders had no way back to their basket short of remembering which shop it
// was and re-opening that storefront. That is an order lost to navigation.
function CartStackScreen() {
  const { t } = useT();
  return (
    <CartStack.Navigator screenOptions={stackScreenOptions}>
      <CartStack.Screen name="CartHome" component={CartScreen} options={{ title: t('cart.title') }} />
      <CartStack.Screen name="PayWebView" component={PayWebView} options={{ title: t('pay.title') }} />
    </CartStack.Navigator>
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
      {/* The web keeps all of these on one scrolling account page. On a phone
          each is its own destination, reached from the hub list on AccountHome. */}
      <AccountStack.Screen name="ChangeNumber" component={ChangeNumberScreen} options={{ title: t('num.change') }} />
      <AccountStack.Screen name="Statement" component={StatementScreen} options={{ title: t('stmt.title') }} />
      <AccountStack.Screen name="Referral" component={ReferralScreen} options={{ title: t('ref.title') }} />
      <AccountStack.Screen name="HelpFaq" component={HelpFaqScreen} options={{ title: t('chelp.title') }} />
      <AccountStack.Screen
        name="FeatureWebView"
        component={FeatureWebView}
        options={({ route }) => ({ title: route.params?.title || t('account.title') })}
      />
    </AccountStack.Navigator>
  );
}

const tabIcon = (glyph) => ({ color }) => <Text style={{ fontSize: 18, color }}>{glyph}</Text>;

// react-navigation renders a string label with numberOfLines={1}, which on a
// 320dp phone truncates the longer Indic tab words to an ellipsis once there
// are five tabs instead of four — and a truncated tab label is unreadable for
// exactly the shoppers who most need the word. So the label is rendered here
// instead: two lines allowed, a tighter line height, and a smaller face. The
// web's tab bar needed the same explicit wrapping help in CSS at six tabs; this
// is the native equivalent.
//
// SIX TABS. A sixth column takes each tab from 64dp to 53dp on a 320dp screen,
// which is the tightest this bar will ever be asked to be. It still clears the
// 48dp minimum touch target, and it is the width the longest labels have to live
// in: 'ಉತ್ಪನ್ನಗಳು', 'ഉൽപ്പന്നങ്ങൾ', 'ఉత్పత్తులు'. At 10px over two lines they wrap
// rather than truncate, which is why the face shrank a point, the icon shrank
// two, the horizontal padding react-navigation puts on each item is removed so
// the text gets the whole column, and the bar grew to 78dp to hold a two-line
// label under an icon. A truncated word is worse than a small one for a shopper
// who reads slowly; nothing here is allowed to ellipsize at 320dp.
const tabLabel = (text) => ({ color }) => (
  <Text
    numberOfLines={2}
    ellipsizeMode="tail"
    style={{ fontSize: 10, lineHeight: 13, fontWeight: '600', color, textAlign: 'center', paddingHorizontal: 1 }}
  >
    {text}
  </Text>
);

function SignedInTabs() {
  const { t } = useT();
  const cart = useCart();
  // The badge mirrors the web's: the live item count, capped at 99+. It is the
  // only thing on screen that says "you still have a basket" once the shopper
  // has navigated away from the shop they built it at.
  const cartCount = cart && cart.count > 0 ? cart.count : 0;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // Taller again at six tabs: the columns are narrower, so more labels wrap
        // to the second line that the fourth tab never asked for.
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border, height: 78, paddingBottom: 8, paddingTop: 6 },
        // Give the label the full column. react-navigation's default item
        // padding is what pushes an Indic word over the edge into an ellipsis.
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.onAccent, fontWeight: '800' },
      }}
    >
      <Tab.Screen name="KhataTab" component={KhataStackScreen} options={{ title: t('tab.khata'), tabBarLabel: tabLabel(t('tab.khata')), tabBarIcon: tabIcon('📒') }} />
      <Tab.Screen name="ShopsTab" component={ShopsStackScreen} options={{ title: t('tab.shops'), tabBarLabel: tabLabel(t('tab.shops')), tabBarIcon: tabIcon('🏪') }} />
      {/* Next to Shops, as on the web, because the two are the same errand:
          find a shop, or find a thing. The other four keep the order shoppers
          already have in their thumbs. */}
      <Tab.Screen name="ProductsTab" component={ProductsStackScreen} options={{ title: t('tab.products'), tabBarLabel: tabLabel(t('tab.products')), tabBarIcon: tabIcon('🔍') }} />
      <Tab.Screen
        name="CartTab"
        component={CartStackScreen}
        options={{
          title: t('tab.cart'),
          tabBarLabel: tabLabel(t('tab.cart')),
          tabBarIcon: tabIcon('🛒'),
          tabBarBadge: cartCount > 0 ? (cartCount > 99 ? '99+' : cartCount) : undefined,
          // The badge is a visual count; a screen reader gets it in words.
          tabBarAccessibilityLabel: cartCount > 0
            ? `${t('tab.cart')}, ${t('shops.itemsCount', { n: cartCount })}`
            : t('tab.cart'),
        }}
      />
      <Tab.Screen name="OrdersTab" component={OrdersStackScreen} options={{ title: t('tab.orders'), tabBarLabel: tabLabel(t('tab.orders')), tabBarIcon: tabIcon('📦') }} />
      <Tab.Screen name="AccountTab" component={AccountStackScreen} options={{ title: t('tab.account'), tabBarLabel: tabLabel(t('tab.account')), tabBarIcon: tabIcon('👤') }} />
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
