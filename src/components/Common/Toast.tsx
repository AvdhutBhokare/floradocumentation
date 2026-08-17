import { useEffect, useState } from 'react';

interface ToastMessage {
  id: number;
  text: string;
}

let toastIdCounter = 0;

/** Fire a transient confirmation toast from anywhere in the app. */
export function showToast(text: string) {
  window.dispatchEvent(new CustomEvent('flora:toast', { detail: { text } }));
}

/** Mount once near the root. Listens for showToast() calls app-wide. */
export function ToastHost() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    function handle(e: Event) {
      const text = (e as CustomEvent).detail?.text as string;
      if (!text) return;
      const id = ++toastIdCounter;
      setMessages((m) => [...m, { id, text }]);
      setTimeout(() => {
        setMessages((m) => m.filter((msg) => msg.id !== id));
      }, 2200);
    }
    window.addEventListener('flora:toast', handle);
    return () => window.removeEventListener('flora:toast', handle);
  }, []);

  if (messages.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[3000] flex -translate-x-1/2 flex-col items-center gap-2">
      {messages.map((m) => (
        <div
          key={m.id}
          className="rounded-md border border-hairline bg-bark-850 px-4 py-2 font-sans text-xs font-medium text-paper-100 shadow-2xl animate-[flora-toast-in_0.15s_ease-out]"
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
