import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/auth.store';

export default function useAuth() {
  const router = useRouter();

  const { token, setToken, logout } = useAuthStore();

  const login = (jwtToken: string) => {
    setToken(jwtToken);

    document.cookie = `token=${jwtToken}; path=/`;

    router.push('/dashboard');
  };

  const signOut = () => {
    logout();

    document.cookie = 'token=; Max-Age=0; path=/';

    router.push('/login');
  };

  return {
    token,
    login,
    signOut
  };
}
