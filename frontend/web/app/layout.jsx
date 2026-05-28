export const metadata = {
  title: 'Smart Digital Khata',
  description: 'AI-native Merchant Finance & Collections SaaS'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif', background: '#f5f7fb' }}>
        {children}
      </body>
    </html>
  );
}
