import { useEffect } from "react";
import { CheckIcon, InfoIcon } from "./Icons.jsx";

export default function ToastContainer({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.duration || 3200);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const isError = toast.type === "error";
  const isWarn = toast.type === "warn";

  return (
    <div className={`toast-item ${toast.type || "info"}`} role="alert" onClick={onDismiss}>
      <span className="toast-icon">
        {isError ? "✕" : isWarn ? "⚠" : <CheckIcon size={14} />}
      </span>
      <span className="toast-message">{toast.message}</span>
    </div>
  );
}
