export const sendLocalNotification = async message => {
  return {
    success: true,
    message: `Notification triggered: ${message}`
  };
};
