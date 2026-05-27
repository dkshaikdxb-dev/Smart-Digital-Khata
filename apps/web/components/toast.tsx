interface ToastProps {
  message: string;
}

export default function Toast({ message }: ToastProps) {
  return (
    <div className="fixed top-5 right-5 bg-black text-white px-5 py-3 rounded-xl shadow-lg">
      {message}
    </div>
  );
}
