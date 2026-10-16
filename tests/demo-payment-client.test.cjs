const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const native = name => props => React.createElement(name, props, props.children);
const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'BottomSheet', 'Card', 'DetailRow', 'Divider', 'ErrorState', 'InlineNotice', 'MoneyText', 'PressableScale', 'Screen', 'SectionHeader', 'Skeleton', 'SkeletonGroup', 'StatusBadge', 'SuccessCheck', 'SwitchRow', 'TabHeader', 'TextField'].map(name => [name, native(name)]));
const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
const wallet = { userId: 'driver', balance: 1000, autoTopUpEnabled: false, autoTopUpAmount: 5000, autoTopUpThreshold: 500 };
const method = { id: 'card-a', brand: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2099, isDefault: true };
async function scenario(screen, flag, run, pending = null) {
  const previous = process.env.EXPO_PUBLIC_SIMULATED_PAYMENTS;
  if (flag === undefined) delete process.env.EXPO_PUBLIC_SIMULATED_PAYMENTS;
  else process.env.EXPO_PUBLIC_SIMULATED_PAYMENTS = flag;
  const submitted = [], topups = [];
  const load = createClientLoader({ application: 'customer', stubs: {
    'react-native': { View: native('View'), ScrollView: native('ScrollView'), RefreshControl: native('RefreshControl'), Platform: { OS: 'web', select: options => options.default }, I18nManager: { allowRTL() {} } },
    'expo-router': { useRouter: () => ({ push() {}, back() {} }), useLocalSearchParams: () => ({}) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'expo-linear-gradient': { LinearGradient: native('LinearGradient') },
    'lucide-react-native': Object.fromEntries(['CreditCard', 'Plus', 'Wallet', 'ChevronRight', 'ChevronLeft', 'ShieldCheck', 'ArrowDownLeft', 'CircleParking', 'Gift', 'CarFront', 'House', 'HandCoins', 'RotateCcw', 'ScrollText', 'SlidersHorizontal'].map(name => [name, native(name)])),
    '@parkflow/client/components/ui': ui,
    '@parkflow/client/services/storage': { secureStorage: storage, appStorage: storage, STORAGE_KEYS: { preferences: 'test-preferences' } },
    '@parkflow/client/theme/ThemeProvider': { useTheme: () => ({ colors: {} }) },
    '@parkflow/client/hooks/useLocale': { useLocale: () => ({ t: key => key, row: 'row', locale: 'en', isRTL: false, alignStart: 'flex-start' }) },
    '@parkflow/client/hooks/useWallet': {
      useWallet: () => ({ data: wallet, isPending: false, isError: false, isRefetching: false, refetch: async () => wallet }),
      usePaymentMethods: () => ({ data: [method] }), useTransactions: () => ({ data: [] }),
      useSetAutoTopUp: () => ({ mutate() {}, isPending: false }),
      useAddPaymentMethod: () => ({ mutate: data => submitted.push(data), isPending: false, isError: false }),
      useTopUp: () => ({ mutate: data => topups.push(data), isPending: false, isError: false }),
    },
    '@parkflow/client/hooks/useIdempotencyKey': { useIdempotencyKey: () => ({ key: () => 'new-key', reset() {} }) },
    '@parkflow/client/utils/haptics': { haptics: { select() {}, success() {}, error() {} } },
    '@parkflow/client/store/authStore': { useAuthStore: selector => selector({ user: { id: 'driver' } }) },
    '@parkflow/client/services/http/walletService': { topUpRecovery: { read: async () => pending } },
  } });
  const Screen = load(`apps/customer/app/${screen}.tsx`).default;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(Screen))); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    await run(renderer.root, { submitted, topups });
  } finally {
    await act(async () => renderer?.unmount()); client.clear();
    if (previous === undefined) delete process.env.EXPO_PUBLIC_SIMULATED_PAYMENTS;
    else process.env.EXPO_PUBLIC_SIMULATED_PAYMENTS = previous;
  }
}

for (const screen of ['(tabs)/wallet', 'wallet/add-card', 'wallet/topup']) {
  test(`${screen} displays the translated demo notice in a simulated-payment build`, async () => {
    await scenario(screen, 'true', root => {
      const notices = root.findAllByType('InlineNotice').filter(node => node.props.title === 'wallet.demoPayment');
      assert.equal(notices.length, 1);
      assert.equal(notices[0].props.body, 'wallet.demoPaymentBody');
      assert.equal(notices[0].props.tone, 'info');
    });
  });
  test(`${screen} hides the demo notice when simulated payments are disabled`, async () => {
    await scenario(screen, 'false', root => {
      assert.equal(root.findAllByType('InlineNotice').some(node => node.props.title === 'wallet.demoPayment'), false);
    });
  });
}

test('adding a card beside the demo notice submits only card metadata', async () => {
  await scenario('wallet/add-card', 'true', async (root, { submitted }) => {
    const fields = { 'wallet.cardNumber': '4242424242424242', 'wallet.expiry': '12/99', 'wallet.cvc': '123' };
    for (const [label, value] of Object.entries(fields)) {
      await act(async () => root.findAllByType('TextField').find(node => node.props.label === label).props.onChangeText(value));
    }
    await act(async () => root.findAllByType('AppButton').find(node => node.props.label === 'common.add').props.onPress());
    assert.deepEqual(submitted, [{ last4: '4242', brand: 'visa', expiryMonth: 12, expiryYear: 2099, holderName: undefined, makeDefault: true }]);
    assert.equal(JSON.stringify(submitted).includes('4242424242424242'), false);
  });
});

test('the demo notice preserves recovery before a new top-up can be started', async () => {
  const pending = { key: 'previous-payment-key', payload: { amount: 2500, paymentMethodId: 'previous-card' } };
  await scenario('wallet/topup', 'true', async (root, { topups }) => {
    assert.equal(root.findByProps({ testID: 'topup-cta' }).props.disabled, true);
    const resume = root.findAllByType('AppButton').find(node => node.props.label === 'Resume previous top-up');
    assert.ok(resume);
    await act(async () => resume.props.onPress());
    assert.deepEqual(topups, [{ amount: 2500, paymentMethodId: 'previous-card', idempotencyKey: 'previous-payment-key' }]);
    assert.equal(root.findAllByType('InlineNotice').some(node => node.props.title === 'wallet.demoPayment'), true);
  }, pending);
});
