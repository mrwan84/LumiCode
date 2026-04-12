import type { Toast as ToastType } from "../types";

interface Props {
  toasts: ToastType[];
}

export default function ToastContainer({ toasts }: Props) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
