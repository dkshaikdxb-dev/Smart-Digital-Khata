const subscriptionPlans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 299,
    customerLimit: 100,
    features: [
      'Customer Ledger',
      'Basic Reports',
      'Dashboard'
    ]
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 999,
    customerLimit: 1000,
    features: [
      'Advanced Reports',
      'WhatsApp Reminders',
      'Analytics'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 2999,
    customerLimit: -1,
    features: [
      'Unlimited Customers',
      'AI Insights',
      'Priority Support'
    ]
  }
];

module.exports = subscriptionPlans;
