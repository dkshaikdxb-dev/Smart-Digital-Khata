export const encryptToken = async token => {
  return `encrypted_${token}`;
};

export const decryptToken = async encryptedToken => {
  return encryptedToken.replace('encrypted_', '');
};
